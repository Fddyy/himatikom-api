fetch("https://api.jsonbin.io/v3/b", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "X-Master-Key": "$2a$10$.AisdYnYVd5hMxklH/Weue3s8fqz1DOHI8LsLw93bm9LzV1eZjYW2"
    },
    body: JSON.stringify({ blogs: [], users: [] }) // Struktur awal data
})
.then(response => response.json())
.then(data => console.log("Bin ID:", data.metadata.id))
.catch(error => console.error("Gagal membuat Bin:", error));
