import { redirect } from 'next/navigation';
import { legacyDestination } from '../../lib/console-navigation';

// Compatibility entry only. The current Console has one interface at `/`.
export default function PreviousPreviewPage() {
  redirect(legacyDestination('/prototype')!);
}
