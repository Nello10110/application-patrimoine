// État d'erreur uniforme (backlog 2.K.1), remplace les
// `<p className="text-sm text-red-600 dark:text-red-400">{error}</p>` répétés à
// l'identique dans une quarantaine d'endroits. Rendu volontairement minimal pour
// ne rien changer visuellement au-delà de la migration vers le jeton `negatif`.
export default function EtatErreur({ message }: { message: string }) {
  return <p className="text-sm text-negatif">{message}</p>
}
