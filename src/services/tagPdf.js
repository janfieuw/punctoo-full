const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

async function makeTagPdf({ companyName, tagName, tagCode, baseUrl }) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));

  doc.fontSize(18).text("ScanTag", { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(12).fillColor("#444").text(companyName);
  doc.fillColor("#000");
  doc.moveDown(1);

  doc.fontSize(16).text(tagName);
  doc.fontSize(12).fillColor("#444").text(`Code: ${tagCode}`);
  doc.fillColor("#000");
  doc.moveDown(1);

  // Two QR codes: IN and OUT
  const inUrl = `${baseUrl}/scan/${encodeURIComponent(tagCode)}/in`;
  const outUrl = `${baseUrl}/scan/${encodeURIComponent(tagCode)}/out`;

  const inData = await QRCode.toDataURL(inUrl, { margin: 1, width: 220 });
  const outData = await QRCode.toDataURL(outUrl, { margin: 1, width: 220 });

  const x = doc.x;
  const y = doc.y;

  doc.fontSize(14).text("IN", x, y);
  doc.image(inData, x, y + 20, { width: 220 });

  doc.fontSize(14).text("OUT", x + 260, y);
  doc.image(outData, x + 260, y + 20, { width: 220 });

  doc.moveDown(15);
  doc.fontSize(10).fillColor("#666")
     .text("Tip: print deze pagina of bewaar als PDF. QR-codes blijven altijd geldig.", { align: "left" });

  doc.end();

  return await new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

module.exports = { makeTagPdf };
