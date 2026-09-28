import * as xlsx from 'xlsx';
import { NextResponse } from 'next/server';
import { DEFAULT_CATALOG } from '@/lib/default-catalog';
import { createClient } from '@/lib/supabase/server';

/**
 * Downloads the base catalogue as an Excel template: one partida per row, with the
 * column headers the /catalog importer recognises (Fase, Código, Partida,
 * Descripción, Unidad, Precio). Editing this file and importing it again is the
 * shortest path to a company's own price list, and it doubles as an export.
 *
 * Served from the server on purpose: /catalog must not pull `xlsx` into the browser
 * bundle (see SPEC §5 and src/lib/document-formats.ts).
 */
export async function GET() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows: (string | number)[][] = [
    ['Fase', 'Código', 'Partida', 'Descripción', 'Unidad', 'Precio', 'Precio mín.', 'Precio máx.'],
  ];

  for (const phase of DEFAULT_CATALOG) {
    for (const service of phase.services) {
      rows.push([
        phase.name,
        service.code,
        service.name,
        service.description,
        service.unit,
        service.base_price,
        service.price_min,
        service.price_max,
      ]);
    }
  }

  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 34 }, { wch: 10 }, { wch: 54 }, { wch: 64 }, { wch: 7 }, { wch: 11 }, { wch: 12 }, { wch: 12 },
  ];

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, 'Catalogo');
  // `array` avoids Node's Buffer, whose type is not assignable to BodyInit here.
  const body = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' }) as BodyInit;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-catalogo.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
