import { readFile, utils } from 'xlsx';
const workbook = readFile('C:\\Users\\Formype\\Desktop\\QLHS\\baocaovipham.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
console.log(JSON.stringify(utils.sheet_to_json(worksheet, { header: 1 }), null, 2));
