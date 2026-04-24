export async function copyToDocumentDir(sourceUri: string, _filename: string): Promise<string> {
  return sourceUri;
}

export async function saveToGallery(_uri: string): Promise<void> {
  // Not supported on web
}
