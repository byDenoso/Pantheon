// Test entry only: actual Worker fetch/download path with synthetic metadata.
import {readDriveTower} from '../worker/drive-source.mjs';
import {TOWER_ID} from '../server/mcp/operational-state.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
const size = new TextEncoder().encode(JSON.stringify(makePrivateTowerFixture())).length;
const binding = {async invoke(_id, action) {return {status: 'success', result: {structuredContent: action === 'list_file_revisions' ? {fileId: TOWER_ID, currentRevisionId: 'synthetic-revision', revisions: [{id: 'synthetic-revision', size, mimeType: 'application/json'}]} : {id: TOWER_ID, mime_type: 'application/json', file_size_bytes: size, file_uri: {download_url: 'https://sdmntprtest.oaiusercontent.com/files/synthetic/raw'}}}};}};
export default {async fetch() {try {const runtime = await readDriveTower(binding);return Response.json({access: runtime.data.access, transport: runtime.data.transport.kind});} catch (e) {return Response.json({error:e.message},{status:503});}}};
