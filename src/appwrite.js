import { Client, Databases, Account, Storage, ID, Query } from 'appwrite';

const client = new Client();

client
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

export const databases = new Databases(client);
export const account = new Account(client);
export const storage = new Storage(client);
export { ID, Query };

export const APPWRITE_CONFIG = {
    databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID,
    bucketId: import.meta.env.VITE_APPWRITE_BUCKET_ID,
    collections: {
        announcements: import.meta.env.VITE_COLLECTION_ANNOUNCEMENTS,
        events: import.meta.env.VITE_COLLECTION_EVENTS,
        'patch-notes': import.meta.env.VITE_COLLECTION_PATCH_NOTES,
        information: import.meta.env.VITE_COLLECTION_INFORMATION
    }
};
