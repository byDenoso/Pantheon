"""Regression for canonical receipt envelopes already present in RESULTADOS."""
import json
import unittest
from scripts import nexo_tower_operations as operations


def valid_receipt():
    return {'run_id': 'audit-test-run', 'runtime': 'local_sandbox', 'class': 'E1',
            'script_sha256': 'a' * 64, 'output_sha256': 'b' * 64,
            'input_hashes': {'observed_input': 'c' * 64}}


def result_row(method):
    return ['2026-10-29T01:00:00+00:00', 'S3', 'numeric-control', 'audit-test-event',
            'E1', method, '1', 'conditional', '', 'https://example.org/private']


class ReceiptPrefixRegression(unittest.TestCase):
    def test_existing_plain_json_remains_valid(self):
        self.assertTrue(operations.executor_receipt(result_row(json.dumps(valid_receipt()))))

    def test_existing_nested_json_remains_valid(self):
        self.assertTrue(operations.executor_receipt(result_row(json.dumps(
            {'EXECUTOR_RECEIPT_V1': valid_receipt()}))))

    def test_canonical_prefixed_json_is_valid(self):
        self.assertTrue(operations.executor_receipt(result_row(
            'EXECUTOR_RECEIPT_V1 ' + json.dumps(valid_receipt()))))

    def test_whitespace_around_envelope_is_accepted(self):
        self.assertTrue(operations.executor_receipt(result_row(
            '\n EXECUTOR_RECEIPT_V1 ' + json.dumps(valid_receipt()) + '\n')))

    def test_prose_containing_a_receipt_is_not_a_structured_envelope(self):
        self.assertFalse(operations.executor_receipt(result_row(
            'Claimed execution: EXECUTOR_RECEIPT_V1 ' + json.dumps(valid_receipt()))))

    def test_prefix_does_not_bypass_hash_validation(self):
        receipt = valid_receipt(); receipt['output_sha256'] = 'not-a-hash'
        self.assertFalse(operations.executor_receipt(result_row(
            'EXECUTOR_RECEIPT_V1 ' + json.dumps(receipt))))

    def test_unknown_version_is_not_accepted(self):
        self.assertFalse(operations.executor_receipt(result_row(
            'EXECUTOR_RECEIPT_V2 ' + json.dumps(valid_receipt()))))

    def test_review_not_promoted_into_scientific_classes(self):
        receipt = valid_receipt(); receipt['class'] = 'E1_REVIEW_RETROSPECTIVE'
        self.assertFalse(operations.executor_receipt(result_row(
            'EXECUTOR_RECEIPT_V1 ' + json.dumps(receipt))))

    def test_projection_still_distinguishes_shape_from_execution(self):
        row = result_row('EXECUTOR_RECEIPT_V1 ' + json.dumps(valid_receipt()))
        views = operations.build_views({'MURAL': {}, 'RESULTADOS': {row[3]: tuple(row)}}, [], {})
        self.assertEqual(views['EXECUCOES'][1][5], 'EXECUTOR_RECEIPT_SHAPE_VALID_NOT_REPLAYED')
        metric = next(r for r in views['AUTONOMIA'] if r[0] == 'verified_quantitative_runs')
        self.assertEqual(metric[1], 'RECEIPT_SHAPE_ONLY_NOT_REPLAYED')
        self.assertEqual(metric[2], '1')
