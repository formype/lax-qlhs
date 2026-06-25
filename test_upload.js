const url = 'https://script.google.com/macros/s/AKfycbwsJP68m0xVqnKZVjw-U8_EL_EQPZLfhrZxV4M-xicykesYD25wN1PcihVVLclxwtNLHw/exec';
const data = {
  filename: 'test.txt',
  mimeType: 'text/plain',
  base64: Buffer.from('Hello world').toString('base64'),
  folderId: '1Et-Jz9EiFoFpGHp139dmf504ZDFe9yhD'
};

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'text/plain',
  },
  body: JSON.stringify(data)
})
.then(res => res.text())
.then(text => console.log('Response:', text))
.catch(err => console.error('Error:', err));
