const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '/')));

// All routes point to chat.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'chat.html'));
});

app.listen(port, () => {
  console.log(`Chat app running on port ${port}`);
});
