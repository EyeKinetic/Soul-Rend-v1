const url = "https://fra.cloud.appwrite.io/v1/storage/buckets/69a80c1b003bf0c1bf89/files/69aa6f3e0003644319a1/preview?project=69a594120012d4480ace";
fetch(url).then(res => {
    console.log("Status:", res.status);
    console.log("Content-Type:", res.headers.get("content-type"));
}).catch(e => console.error(e));
