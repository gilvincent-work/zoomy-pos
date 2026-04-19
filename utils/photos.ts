import { File, Paths } from 'expo-file-system/next';
import * as MediaLibrary from 'expo-media-library';

export async function copyToDocumentDir(sourceUri: string, filename: string): Promise<string> {
  const source = new File(sourceUri);
  const dest = new File(Paths.document, filename);
  await source.copy(dest);
  return dest.uri;
}

export async function saveToGallery(uri: string): Promise<void> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'granted') {
      await MediaLibrary.saveToLibraryAsync(uri);
    }
  } catch {
    // Best-effort — photo is already saved to document directory
  }
}
