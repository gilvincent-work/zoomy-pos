export const documentDirectory = 'file:///mock/documents/';

export const getInfoAsync = jest.fn().mockResolvedValue({ exists: true });

export const copyAsync = jest.fn().mockResolvedValue(undefined);

export const deleteAsync = jest.fn().mockResolvedValue(undefined);
