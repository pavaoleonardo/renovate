import { redirect } from 'next/navigation';

/**
 * The old flat list of every budget. Obras are listed on the ficha of the client
 * that owns them now, so this address only exists for bookmarks.
 */
export default function EstimatesList() {
  redirect('/clients');
}
