/* =========================================================
   DCEB Payment Acknowledgement Slip (PDF), made in the browser.
   Requires jsPDF and jsPDF-AutoTable, loaded in index.html.
   ========================================================= */
const SLIP_COLORS = {
    navy: [13, 31, 66], orange: [230, 126, 34], green: [22, 150, 98], red: [220, 38, 38],
    amber: [217, 119, 6], grey: [100, 116, 139], dark: [30, 41, 59],
    light: [241, 245, 249], border: [203, 213, 225]
};
const STATUS_STYLE = {
    Verified: { label: 'VERIFIED', color: SLIP_COLORS.green },
    Rejected: { label: 'REJECTED', color: SLIP_COLORS.red },
    Pending: { label: 'PENDING VERIFICATION', color: SLIP_COLORS.amber }
};

const slipAmount = n => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const slipDateTime = iso => new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
});
const slipPaymentDate = iso => {
    const d = new Date(iso);
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${time} on ${date}`;
};

async function buildPaymentSlip(p) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 15;
    const st = STATUS_STYLE[p.status] || STATUS_STYLE.Pending;

    doc.setDrawColor(...SLIP_COLORS.navy);
    doc.setLineWidth(0.8); doc.rect(8, 8, W - 16, 281);
    doc.setLineWidth(0.3); doc.rect(10, 10, W - 20, 277);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...SLIP_COLORS.orange);
    doc.text('GOVERNMENT OF ANDHRA PRADESH', M + 2, 20);
    doc.setFontSize(16);
    doc.setTextColor(...SLIP_COLORS.navy);
    doc.text('District Common Examination Board', M + 2, 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...SLIP_COLORS.grey);
    doc.text('Sri Sathya Sai District, Puttaparthi', M + 2, 34);

    doc.setFillColor(...SLIP_COLORS.navy);
    doc.rect(M, 41, W - 2 * M, 1.6, 'F');
    doc.setFillColor(...SLIP_COLORS.orange);
    doc.rect(M, 42.8, W - 2 * M, 0.8, 'F');

    doc.setFillColor(...SLIP_COLORS.navy);
    doc.roundedRect(M, 47, W - 2 * M, 10, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('PAYMENT ACKNOWLEDGEMENT SLIP', W / 2, 53.5, { align: 'center' });

    const cardY = 61, cardH = 26;
    doc.setFillColor(...SLIP_COLORS.light);
    doc.setDrawColor(...SLIP_COLORS.border);
    doc.roundedRect(M, cardY, W - 2 * M, cardH, 2, 2, 'FD');
    doc.setFillColor(...st.color);
    doc.rect(M, cardY, 1.5, cardH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLIP_COLORS.grey);
    doc.text('AMOUNT PAID', M + 6, cardY + 7);
    doc.setFontSize(20);
    doc.setTextColor(...SLIP_COLORS.navy);
    doc.text(slipAmount(p.amount), M + 6, cardY + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLIP_COLORS.grey);
    doc.text(`UTR: ${p.utr}`, M + 6, cardY + 22);

    const pillW = 60, pillH = 10;
    const pillX = W - M - pillW - 6, pillY = cardY + 8;
    doc.setFillColor(...st.color);
    doc.roundedRect(pillX, pillY, pillW, pillH, 5, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(st.label, pillX + pillW / 2, pillY + 6.5, { align: 'center' });

    let y = cardY + cardH + 6;

    if (p.status === 'Rejected') {
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(...SLIP_COLORS.red);
        doc.roundedRect(M, y, W - 2 * M, 17, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...SLIP_COLORS.red);
        doc.text('REASON FOR REJECTION', M + 5, y + 6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...SLIP_COLORS.dark);
        doc.text(p.remarks || 'Not specified', M + 5, y + 12.5);
        y += 23;
    }

    const section = (title, startY) => {
        doc.setFillColor(...SLIP_COLORS.orange);
        doc.rect(M, startY, 1.6, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(...SLIP_COLORS.navy);
        doc.text(title, M + 4, startY + 4.7);
        return startY + 9;
    };

    const tableStyle = {
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 2.6, textColor: SLIP_COLORS.dark, lineColor: SLIP_COLORS.border },
        alternateRowStyles: { fillColor: SLIP_COLORS.light },
        columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold', textColor: SLIP_COLORS.grey }, 1: { cellWidth: 'auto' } },
        margin: { left: M, right: M }
    };

    y = section('School Details', y);
    doc.autoTable({
        ...tableStyle, startY: y,
        body: [
            ['School Name', (p.school || '').toUpperCase()],
            ['UDISE Code', p.udise],
            ['Mandal', p.mandal],
            ['Headmaster / Principal', p.hm],
            ['Contact Mobile', p.mobile]
        ]
    });
    y = doc.lastAutoTable.finalY + 8;

    y = section('Payment Details', y);
    doc.autoTable({
        ...tableStyle, startY: y,
        body: [
            ['Payment Purpose', p.purposeLabel],
            ['Fee Payable', slipAmount(p.feePayable ?? p.amount)],
            ['Amount Paid', slipAmount(p.amount)],
            ['UTR Number', p.utr],
            ['Transaction / Payment ID', p.txnId || '-'],
            ['Paid By', p.paidBy],
            ['Payment App', p.paymentApp],
            ['Payment Date & Time', slipPaymentDate(p.paidAt)],
            ['Submitted On', slipDateTime(p.submittedAt)]
        ]
    });
    y = doc.lastAutoTable.finalY + 8;

    const noteText = p.status === 'Rejected'
        ? 'This payment was not accepted by the DCEB office. Please correct the issue mentioned above and resubmit the payment details, or contact the DCEB office for help.'
        : 'This slip shows the payment details submitted on the DCEB portal. It is not a bank confirmation; final confirmation is subject to verification of the transaction with the bank by the DCEB office.';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...(p.status === 'Rejected' ? SLIP_COLORS.red : SLIP_COLORS.orange));
    doc.text('NOTE', M, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLIP_COLORS.grey);
    doc.text(doc.splitTextToSize(noteText, W - 2 * M - 16), M + 14, y + 3);

    doc.setFillColor(...SLIP_COLORS.navy);
    doc.rect(10, 262, W - 20, 25, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text('DCEB, Sri Sathya Sai District  |  Helpdesk: +91 8179515136  |  dcebsrisatyasai@gmail.com', W / 2, 271, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Computer generated slip  |  Generated on ${slipDateTime(new Date().toISOString())}`, W / 2, 278, { align: 'center' });

    return doc;
}

async function downloadPaymentSlip(payment) {
    const doc = await buildPaymentSlip(payment);
    doc.save(`DCEB_Payment_Slip_${payment.utr}.pdf`);
}
