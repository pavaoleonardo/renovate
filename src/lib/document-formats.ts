/**
 * Formats a budget can arrive in, shared by the upload UI and the reader.
 *
 * Kept in its own module with no imports: /catalog is a client component, and
 * importing these constants from the reader (which uses node:zlib and xlsx) would
 * drag those into the browser bundle.
 */

/** Value for the `accept` attribute of the file input. */
export const DOCUMENT_ACCEPT =
  '.xlsx,.xlsm,.xlsb,.xls,.ods,.csv,.tsv,.txt,.pdf,.docx,.html,.htm,.xml'

/** Human list of what can be uploaded, reused by the copy of /catalog. */
export const DOCUMENT_FORMATS_TEXT =
  'Excel (.xlsx, .xls, .xlsm), CSV, PDF, Word (.docx), ODS y hojas exportadas a HTML'
