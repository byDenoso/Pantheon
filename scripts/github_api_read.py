"""Authenticated metadata reads, confined to api.github.com and bounded retries."""
import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from email.utils import parsedate_to_datetime


class NoApiRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward the bearer credential to a redirected request.
        raise ValueError('GitHub metadata redirects are not followed')


def retry_delay(headers, now):
    delays = []
    retry = headers.get('Retry-After')
    if retry:
        try:
            delays.append(float(retry))
        except ValueError:
            try:
                delays.append(parsedate_to_datetime(retry).timestamp() - now)
            except (ValueError, TypeError, OverflowError):
                pass
    if headers.get('X-RateLimit-Remaining') == '0':
        try:
            delays.append(float(headers.get('X-RateLimit-Reset')) - now)
        except (ValueError, TypeError):
            pass
    return max(1, math.ceil(max(delays))) if delays and all(math.isfinite(x) for x in delays) else None


def read_api_json(url, *, opener=None, sleep=time.sleep, now=time.time):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'api.github.com' or parsed.fragment:
        raise ValueError('Authenticated reads require the exact GitHub API origin')
    token = os.environ.get('GH_TOKEN')
    if not token:
        raise ValueError('Existing ephemeral GH_TOKEN is required; no anonymous fallback')
    request = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json', 'User-Agent': 'nexo-writer-robot',
        'Authorization': 'Bearer ' + token})
    opener = opener or urllib.request.build_opener(NoApiRedirect())
    for attempt in range(2):
        try:
            with opener.open(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            rate_limited = error.code == 429 or (error.code == 403 and
                           (error.headers.get('X-RateLimit-Remaining') == '0' or error.headers.get('Retry-After')))
            delay = retry_delay(error.headers, now())
            if not rate_limited or attempt == 1:
                raise
            if delay is None or delay > 60:
                # Do not retry earlier than the server allows or hold a Writer
                # lock across a long quota window. Normal future cycles remain.
                raise RuntimeError('GitHub rate limit requires a later cycle; no immediate retry') from None
            sleep(delay)
