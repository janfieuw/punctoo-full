const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

async function makeTagPdf({ companyName, tagName, tagCode, baseUrl }) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  // White background
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFFFFF");
  doc.fillColor("#000000");

  doc.fontSize(22).font("Helvetica-Bold").text(companyName, { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(16).font("Helvetica-Bold").text(tagName);
  doc.fontSize(12).font("Helvetica").text(`Code: ${tagCode}`);
  doc.moveDown(1);

  const inUrl = `${baseUrl}/scan/in/${encodeURIComponent(tagCode)}`;
  const outUrl = `${baseUrl}/scan/out/${encodeURIComponent(tagCode)}`;

  const inPng = await QRCode.toDataURL(inUrl, { margin: 1, width: 260 });
  const outPng = await QRCode.toDataURL(outUrl, { margin: 1, width: 260 });

  const imgFromDataUrl = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");

  const x1 = 80, y = 220;
  doc.fontSize(14).font("Helvetica-Bold").text("IN", x1 + 90, y - 30);
  doc.image(imgFromDataUrl(inPng), x1, y, { width: 260 });

  const x2 = 330;
  doc.fontSize(14).font("Helvetica-Bold").text("OUT", x2 + 80, y - 30);
  doc.image(imgFromDataUrl(outPng), x2, y, { width: 260 });

  doc.moveTo(60, y + 280).lineTo(535, y + 280).strokeColor("#DDD").stroke();
  doc.fillColor("#555").fontSize(10).text("ScanTag PDF — MyPunctoo", 60, y + 300);

  doc.end();
  return done;
}

module.exports = { makeTagPdf };
