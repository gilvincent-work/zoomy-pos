import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

export async function copyToDocumentDir(sourceUri: string, filename: string): Promise<string> {
  const destUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

export async function saveToGallery(uri: string): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status === 'granted') {
    await MediaLibrary.saveToLibraryAsync(uri);
  }
}
