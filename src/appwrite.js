import { Client, Databases, Account, Storage, ID } from 'appwrite';

const client = new Client();

client
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('69a594120012d4480ace');

export const databases = new Databases(client);
export const account = new Account(client);
export const storage = new Storage(client);
export { ID };

export const APPWRITE_CONFIG = {
    databaseId: '69a5af9d000032e51e23',
    bucketId: '69a80c1b003bf0c1bf89',
    collections: {
        announcements: '69a5b156000e20ec4506',
        events: '69a5b159002c9dd2fd46',
        'patch-notes': '69a5b15800028b23abf4', // Used mapping patchNotes -> patch-notes
        information: '69a5b15400132d5ca4b8' // WikiLore
    }
};
