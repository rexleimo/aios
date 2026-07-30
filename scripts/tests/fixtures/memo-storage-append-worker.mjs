import { appendMemoEvent } from '../../lib/memo/storage.mjs';

const [workspaceRoot, storage, text] = process.argv.slice(2);
const event = await appendMemoEvent({ workspaceRoot, storage, text });
process.stdout.write(`${JSON.stringify({ eventId: event.eventId, seq: event.seq })}\n`);
