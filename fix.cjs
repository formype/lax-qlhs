const fs = require('fs');
const file = 'src/pages/BoardingAttendance.jsx';
let text = fs.readFileSync(file, 'utf8');

text = text.replace('["STT", "Họ tên", "Lớp", "Ngày", "Buổi", "Trạng thái", "Ghi chú"]', '["STT", "Họ tên", "Lớp", "Ngày", "Trạng thái", "Ghi chú"]');
text = text.replace(/v\.date \? format\(parseISO\(v\.date\), 'dd\/MM\/yyyy'\) : '',\s*v\.session \|\| '',\s*statusStr,/g, 'v.date ? format(parseISO(v.date), \'dd/MM/yyyy\') : \'\',\n        statusStr,');
text = text.replace('6: { cellWidth: 70 }', '5: { cellWidth: 70 }');
text = text.replace('DANH SÁCH THEO DÕI TÌNH HÌNH CHUYÊN CẦN CỦA HỌC SINH', 'DANH SÁCH THEO DÕI TÌNH HÌNH BÁN TRÚ CỦA HỌC SINH');
text = text.replace('BaoCaoChuyenCan_.pdf', 'TheoDoiBanTru_.pdf');

// Excel fixes
text = text.replace('["STT", "Họ tên", "Lớp", "Ngày", "Buổi", "Trạng thái", "Lý do vắng", "Ghi chú"]', '["STT", "Họ tên", "Lớp", "Ngày", "Trạng thái", "Lý do vắng", "Ghi chú"]');
text = text.replace('v.date ? format(parseISO(v.date), \'dd/MM/yyyy\') : \'\',\n        v.session || \'\',\n        statusStr,', 'v.date ? format(parseISO(v.date), \'dd/MM/yyyy\') : \'\',\n        statusStr,');
text = text.replace('{ width: 15 }, // E: Buổi\n      { width: 20 }, // F: Trạng thái\n      { width: 20 }, // G: Lý do vắng\n      { width: 30 }  // H: Ghi chú', '{ width: 20 }, // E: Trạng thái\n      { width: 20 }, // F: Lý do vắng\n      { width: 30 }  // G: Ghi chú');
text = text.replace('worksheet.mergeCells(\'E1:H1\');', 'worksheet.mergeCells(\'E1:G1\');');
text = text.replace('const cellE1 = worksheet.getCell(\'E1\');', 'const cellE1 = worksheet.getCell(\'E1\');'); // actually same
text = text.replace('worksheet.mergeCells(\'E2:H2\');', 'worksheet.mergeCells(\'E2:G2\');');
text = text.replace('worksheet.mergeCells(\'A4:H4\');', 'worksheet.mergeCells(\'A4:G4\');');
text = text.replace('const cellA4 = worksheet.getCell(\'A4\');\n    cellA4.value = "DANH SÁCH THEO DÕI TÌNH HÌNH CHUYÊN CẦN CỦA HỌC SINH";', 'const cellA4 = worksheet.getCell(\'A4\');\n    cellA4.value = "DANH SÁCH THEO DÕI TÌNH HÌNH BÁN TRÚ CỦA HỌC SINH";');
text = text.replace('if (colNumber === 8) {', 'if (colNumber === 7) {');
text = text.replace('const worksheet = workbook.addWorksheet(\'BaoCaoChuyenCan\');', 'const worksheet = workbook.addWorksheet(\'TheoDoiBanTru\');');
text = text.replace('saveAs(blob, BaoCaoChuyenCan_.xlsx);', 'saveAs(blob, TheoDoiBanTru_.xlsx);');

fs.writeFileSync(file, text, 'utf8');
