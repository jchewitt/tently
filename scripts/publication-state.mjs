export function selectPublicationState(artifacts, attempt) {
  const previous = artifacts.flatMap((artifact) => {
    const match = /^weftlet-publication-state-(\d+)$/.exec(artifact.name);
    return match && Number(match[1]) < attempt ? [{ ...artifact, attempt: Number(match[1]) }] : [];
  }).sort((left, right) => right.attempt - left.attempt);
  if (!previous.length) return '';
  if (previous[0].expired) throw new Error('Previous publication receipts expired; inspect registry state before recovery');
  if (previous[1]?.attempt === previous[0].attempt) throw new Error('Ambiguous publication-state artifacts');
  return previous[0].name;
}
