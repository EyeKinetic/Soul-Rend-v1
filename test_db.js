import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('69a594120012d4480ace'); // Assuming this is correct from frontend code

const databases = new Databases(client);

async function checkEvents() {
    try {
        const response = await databases.listDocuments(
            '69a5af9d000032e51e23', // db Id
            '69a5b159002c9dd2fd46' // events collection id
        );
        console.log("Found Events:", response.documents.length);
        if (response.documents.length > 0) {
            console.log(JSON.stringify(response.documents.map(d => ({
                id: d.$id,
                title: d.event_name,
                image: d.image || d.img || "NULL",
                end_time: d.end_time,
                start_time: d.start_time
            })), null, 2));
        }
    } catch (e) {
        console.error("Error reading db:", e.message);
    }
}

checkEvents();
