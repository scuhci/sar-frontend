const normalizeHeader = (header) =>
  header.replace(/^"|"$/g, "").trim().toLowerCase().replace(/\s+/g, "");

const normalizeAppId = (value) => value.replace(/^"|"$/g, "").trim();

const findAppIdColumnIndex = (headers) => {
  const normalized = headers.map(normalizeHeader);
  const appIdIndex = normalized.indexOf("appid");
  return appIdIndex !== -1 ? appIdIndex : normalized.indexOf("app id");
};

const filterCsvByAppIds = async (csvBlob, appIds, includeBom = true) => {
  const csvText = await csvBlob.text();
  const text = csvText.replace(/^\ufeff/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return new Blob([includeBom ? "\ufeff" : "", text], {
      type: "text/csv;charset=utf-8",
    });
  }

  const headers = lines[0].split(",");
  const appIdIndex = findAppIdColumnIndex(headers);

  if (appIdIndex === -1) {
    return new Blob([includeBom ? "\ufeff" : "", csvText], {
      type: "text/csv;charset=utf-8",
    });
  }

  const selectedSet = new Set(appIds);
  const filteredLines = [lines[0]];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length > appIdIndex && selectedSet.has(normalizeAppId(cols[appIdIndex]))) {
      filteredLines.push(lines[i]);
    }
  }

  const content = filteredLines.join("\n");
  return new Blob([includeBom ? "\ufeff" : "", content], {
    type: "text/csv;charset=utf-8",
  });
};

export default filterCsvByAppIds;
