export function buildCostReport(scan, taskPlan, freshness) {
  const selectedBytes = new Set(taskPlan.selectedFiles)
    .size
    ? scan.files
      .filter((file) => taskPlan.selectedFiles.includes(file.path))
      .reduce((sum, file) => sum + file.size, 0)
    : 0;
  const avoidedBytes = Math.max(0, scan.totals.bytesScanned - selectedBytes);

  return {
    generatedAt: scan.generatedAt,
    filesScanned: scan.totals.filesScanned,
    filesSkipped: scan.totals.filesSkipped,
    bytesScanned: scan.totals.bytesScanned,
    bytesSkipped: scan.totals.bytesSkipped,
    selectedContextFiles: taskPlan.selectedFiles.length,
    selectedContextBytes: selectedBytes,
    estimatedTokensAvoided: Math.ceil(avoidedBytes / 4),
    contextModeSelected: taskPlan.contextMode,
    fullGraphAvoided: taskPlan.contextMode !== 'full',
    freshnessRecommendation: freshness.recommendation
  };
}
