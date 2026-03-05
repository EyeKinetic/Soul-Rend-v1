import { Client, Storage } from 'appwrite';

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject('661642...mock'); // Just checking URL structure

const storage = new Storage(client);
const url = storage.getFileView('bucketId123', 'fileId456');

console.log("URL Object or String:", url);
console.log("HREF:", url.href);
