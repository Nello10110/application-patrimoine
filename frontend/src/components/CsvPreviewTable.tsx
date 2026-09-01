/** Aperçu tabulaire des 5 premières lignes d'un fichier importé, avant mapping des
 * colonnes — partagé entre les trois flux d'import CSV de `ImportPage.tsx`
 * (relevé de positions, mouvements bancaires), cf. backlog audit maintenabilité. */
export default function CsvPreviewTable({ columns, rows }: { columns: string[]; rows: Record<string, string>[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-bordure text-left text-texte-attenue">
            {columns.map((c) => (
              <th key={c} className="py-1.5 pr-4 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row, i) => (
            <tr key={i} className="border-b border-bordure">
              {columns.map((c) => (
                <td key={c} className="py-1.5 pr-4 text-texte">
                  {row[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
