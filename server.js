const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files from root
app.use(express.static(__dirname));

// Handle all routes by serving chat.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'chat.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
