const xlsx = require('xlsx');
const workbook = xlsx.readFile('C:\\Users\\Formype\\Desktop\\QLHS\\baocaochuyencan.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
console.log(JSON.stringify(xlsx.utils.sheet_to_json(worksheet, { header: 1 }), null, 2));
