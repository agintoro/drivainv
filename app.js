(() => {
  'use strict';

  const STORAGE_KEY = 'driva_invoice_os_v5_pdf_scope_fixed';
  const $ = (id) => document.getElementById(id);
  const moneySymbols = { IDR: 'Rp', USD: '$' };

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const defaultState = {
    items: [
      { id: uid(), name: 'Indragiri Green Bean', price: 210000, unit: 'kg' },
      { id: uid(), name: 'Mossto Natural 120H', price: 65000, unit: '100g' }
    ],
    customers: [
      { id: uid(), name: 'Sample Buyer', email: 'buyer@example.com', address: 'Bandung, Indonesia' }
    ],
    terms: [
      { id: uid(), title: 'Standard Terms', content: 'Payment due according to agreed invoice date. Coffee will be released after payment confirmation. Shipping cost and risk follow buyer agreement.' }
    ],
    invoices: []
  };

  let state = loadState();
  let invoiceLines = [];
  let editItemId = null;
  let editCustomerId = null;
  let editTermsId = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return {
        items: Array.isArray(parsed.items) ? parsed.items : defaultState.items,
        customers: Array.isArray(parsed.customers) ? parsed.customers : defaultState.customers,
        terms: Array.isArray(parsed.terms) ? parsed.terms : defaultState.terms,
        invoices: Array.isArray(parsed.invoices) ? parsed.invoices : []
      };
    } catch (error) {
      console.warn('State reset because stored data was invalid.', error);
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function formatMoney(value, currency = $('currency')?.value || 'IDR') {
    const number = Number(value || 0);
    if (currency === 'USD') {
      return `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `Rp${Math.round(number).toLocaleString('id-ID')}`;
  }

  function invoiceNumber() {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `DRIVA-INV-${stamp}-${String(state.invoices.length + 1).padStart(3, '0')}`;
  }

  function seedInvoiceForm() {
    $('invoiceNo').value = invoiceNumber();
    $('invoiceDate').value = today();
    $('dueDate').value = today();
    $('discountType').value = 'none';
    $('discountValue').value = '0';
    invoiceLines = [{ id: uid(), itemId: state.items[0]?.id || '', qty: 1, price: state.items[0]?.price || 0 }];
    renderAll();
  }

  function switchTab(tab) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    $(`tab-${tab}`)?.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    const titles = { invoice: 'New Invoice', items: 'Item Library', customers: 'Customer Library', terms: 'Terms Library', history: 'Invoice History' };
    $('screenTitle').textContent = titles[tab] || 'Driva Invoice OS';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindTap(selector, handler) {
    document.querySelectorAll(selector).forEach(el => {
      el.addEventListener('click', handler, { passive: false });
      el.addEventListener('touchend', (event) => {
        event.preventDefault();
        handler.call(el, event);
      }, { passive: false });
    });
  }

  function renderSelects() {
    const customerSelect = $('customerSelect');
    customerSelect.innerHTML = state.customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') || '<option value="">No customer yet</option>';

    const termsSelect = $('termsSelect');
    termsSelect.innerHTML = state.terms.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('') || '<option value="">No terms yet</option>';
    syncTermsText();
  }

  function renderInvoiceLines() {
    const wrap = $('invoiceLines');
    wrap.innerHTML = invoiceLines.map((line) => {
      const options = state.items.map(item => `<option value="${item.id}" ${item.id === line.itemId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
      return `<div class="line-item" data-line-id="${line.id}">
        <label>Item<select data-line-field="itemId">${options}</select></label>
        <label>Qty<input data-line-field="qty" inputmode="decimal" type="number" min="0" step="0.01" value="${Number(line.qty || 0)}"></label>
        <label>Price<input data-line-field="price" inputmode="decimal" type="number" min="0" step="0.01" value="${Number(line.price || 0)}"></label>
        <button class="danger-btn" type="button" data-remove-line="${line.id}">Remove</button>
      </div>`;
    }).join('');

    wrap.querySelectorAll('[data-line-field]').forEach(input => {
      input.addEventListener('change', updateLineFromInput);
      input.addEventListener('input', updateLineFromInput);
    });
    bindTap('[data-remove-line]', (event) => {
      const id = event.currentTarget?.dataset.removeLine || event.target.dataset.removeLine;
      invoiceLines = invoiceLines.filter(line => line.id !== id);
      if (!invoiceLines.length) invoiceLines.push({ id: uid(), itemId: state.items[0]?.id || '', qty: 1, price: state.items[0]?.price || 0 });
      renderInvoiceLines();
      updateTotals();
    });
    updateTotals();
  }

  function updateLineFromInput(event) {
    const box = event.target.closest('.line-item');
    const line = invoiceLines.find(l => l.id === box.dataset.lineId);
    if (!line) return;
    const field = event.target.dataset.lineField;
    if (field === 'itemId') {
      line.itemId = event.target.value;
      const item = state.items.find(i => i.id === line.itemId);
      if (item) line.price = Number(item.price || 0);
      renderInvoiceLines();
      return;
    }
    line[field] = Number(event.target.value || 0);
    updateTotals();
  }

  function totals() {
    const subtotal = invoiceLines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0), 0);
    const type = $('discountType').value;
    const raw = Number($('discountValue').value || 0);
    const discount = type === 'percent' ? subtotal * Math.min(raw, 100) / 100 : type === 'fixed' ? Math.min(raw, subtotal) : 0;
    const total = Math.max(0, subtotal - discount);
    return { subtotal, discount, total };
  }

  function updateTotals() {
    const currency = $('currency').value;
    const t = totals();
    $('subtotalText').textContent = formatMoney(t.subtotal, currency);
    $('discountText').textContent = formatMoney(t.discount, currency);
    $('totalText').textContent = formatMoney(t.total, currency);
  }

  function renderItems() {
    $('itemList').innerHTML = state.items.map(item => `<div class="library-item">
      <div><strong>${escapeHtml(item.name)}</strong><span>${formatMoney(item.price)} / ${escapeHtml(item.unit || 'unit')}</span></div>
      <div class="mini-actions"><button type="button" data-edit-item="${item.id}">Edit</button><button class="delete" type="button" data-delete-item="${item.id}">Delete</button></div>
    </div>`).join('') || '<p>No items yet.</p>';
    bindTap('[data-edit-item]', (event) => editItem(event.target.dataset.editItem));
    bindTap('[data-delete-item]', (event) => deleteItem(event.target.dataset.deleteItem));
  }

  function renderCustomers() {
    $('customerList').innerHTML = state.customers.map(c => `<div class="library-item">
      <div><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.email || '')}\n${escapeHtml(c.address || '')}</span></div>
      <div class="mini-actions"><button type="button" data-edit-customer="${c.id}">Edit</button><button class="delete" type="button" data-delete-customer="${c.id}">Delete</button></div>
    </div>`).join('') || '<p>No customers yet.</p>';
    bindTap('[data-edit-customer]', (event) => editCustomer(event.target.dataset.editCustomer));
    bindTap('[data-delete-customer]', (event) => deleteCustomer(event.target.dataset.deleteCustomer));
  }

  function renderTerms() {
    $('termsList').innerHTML = state.terms.map(t => `<div class="library-item">
      <div><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.content || '')}</span></div>
      <div class="mini-actions"><button type="button" data-edit-terms="${t.id}">Edit</button><button class="delete" type="button" data-delete-terms="${t.id}">Delete</button></div>
    </div>`).join('') || '<p>No terms yet.</p>';
    bindTap('[data-edit-terms]', (event) => editTerms(event.target.dataset.editTerms));
    bindTap('[data-delete-terms]', (event) => deleteTerms(event.target.dataset.deleteTerms));
  }

  function renderHistory() {
    $('historyList').innerHTML = state.invoices.slice().reverse().map(inv => `<div class="library-item">
      <div><strong>${escapeHtml(inv.no)}</strong><span>${escapeHtml(inv.customerName)} • ${escapeHtml(inv.date)} • ${formatMoney(inv.total, inv.currency)}</span></div>
      <div class="mini-actions"><button type="button" data-load-invoice="${inv.id}">Load</button><button class="delete" type="button" data-delete-invoice="${inv.id}">Delete</button></div>
    </div>`).join('') || '<p>No saved invoices yet.</p>';
    bindTap('[data-load-invoice]', (event) => loadInvoice(event.target.dataset.loadInvoice));
    bindTap('[data-delete-invoice]', (event) => deleteInvoice(event.target.dataset.deleteInvoice));
  }

  function renderAll() {
    renderSelects();
    renderInvoiceLines();
    renderItems();
    renderCustomers();
    renderTerms();
    renderHistory();
    updateTotals();
  }

  function saveItem() {
    const name = $('itemName').value.trim();
    const price = Number($('itemPrice').value || 0);
    const unit = $('itemUnit').value.trim() || 'unit';
    if (!name) return alert('Item name is required.');
    if (editItemId) {
      state.items = state.items.map(i => i.id === editItemId ? { ...i, name, price, unit } : i);
      editItemId = null;
    } else {
      state.items.push({ id: uid(), name, price, unit });
    }
    $('itemName').value = ''; $('itemPrice').value = ''; $('itemUnit').value = '';
    saveState(); renderAll();
  }

  function editItem(id) {
    const item = state.items.find(i => i.id === id); if (!item) return;
    editItemId = id; $('itemName').value = item.name; $('itemPrice').value = item.price; $('itemUnit').value = item.unit;
    switchTab('items');
  }
  function deleteItem(id) { state.items = state.items.filter(i => i.id !== id); saveState(); renderAll(); }

  function saveCustomer() {
    const name = $('customerName').value.trim();
    if (!name) return alert('Customer name is required.');
    const customer = { id: editCustomerId || uid(), name, email: $('customerEmail').value.trim(), address: $('customerAddress').value.trim() };
    state.customers = editCustomerId ? state.customers.map(c => c.id === editCustomerId ? customer : c) : [...state.customers, customer];
    editCustomerId = null; $('customerName').value = ''; $('customerEmail').value = ''; $('customerAddress').value = '';
    saveState(); renderAll();
  }
  function editCustomer(id) { const c = state.customers.find(x => x.id === id); if (!c) return; editCustomerId = id; $('customerName').value = c.name; $('customerEmail').value = c.email; $('customerAddress').value = c.address; switchTab('customers'); }
  function deleteCustomer(id) { state.customers = state.customers.filter(c => c.id !== id); saveState(); renderAll(); }

  function saveTerms() {
    const title = $('termsTitle').value.trim();
    const content = $('termsContent').value.trim();
    if (!title || !content) return alert('Terms title and content are required.');
    const item = { id: editTermsId || uid(), title, content };
    state.terms = editTermsId ? state.terms.map(t => t.id === editTermsId ? item : t) : [...state.terms, item];
    editTermsId = null; $('termsTitle').value = ''; $('termsContent').value = '';
    saveState(); renderAll();
  }
  function editTerms(id) { const t = state.terms.find(x => x.id === id); if (!t) return; editTermsId = id; $('termsTitle').value = t.title; $('termsContent').value = t.content; switchTab('terms'); }
  function deleteTerms(id) { state.terms = state.terms.filter(t => t.id !== id); saveState(); renderAll(); }
  function syncTermsText() { const t = state.terms.find(x => x.id === $('termsSelect').value); $('termsText').value = t?.content || ''; }

  function collectInvoice() {
    const customer = state.customers.find(c => c.id === $('customerSelect').value) || { name: '', email: '', address: '' };
    const lineData = invoiceLines.map(line => {
      const item = state.items.find(i => i.id === line.itemId) || { name: 'Custom item', unit: 'unit' };
      return { name: item.name, unit: item.unit, qty: Number(line.qty || 0), price: Number(line.price || 0), amount: Number(line.qty || 0) * Number(line.price || 0) };
    });
    const t = totals();
    return {
      id: uid(), no: $('invoiceNo').value.trim() || invoiceNumber(), date: $('invoiceDate').value || today(), dueDate: $('dueDate').value || '', currency: $('currency').value,
      customerName: customer.name, customerEmail: customer.email, customerAddress: customer.address, lines: lineData,
      discountType: $('discountType').value, discountValue: Number($('discountValue').value || 0), terms: $('termsText').value.trim(), subtotal: t.subtotal, discount: t.discount, total: t.total
    };
  }

  function saveInvoice() {
    const inv = collectInvoice();
    state.invoices.push(inv);
    saveState(); renderHistory();
    $('pdfStatus').textContent = `Saved ${inv.no}.`;
  }

  function loadInvoice(id) {
    const inv = state.invoices.find(i => i.id === id); if (!inv) return;
    $('invoiceNo').value = inv.no; $('invoiceDate').value = inv.date; $('dueDate').value = inv.dueDate; $('currency').value = inv.currency;
    $('discountType').value = inv.discountType; $('discountValue').value = inv.discountValue; $('termsText').value = inv.terms;
    const customer = state.customers.find(c => c.name === inv.customerName); if (customer) $('customerSelect').value = customer.id;
    invoiceLines = inv.lines.map(l => {
      const existing = state.items.find(i => i.name === l.name);
      return { id: uid(), itemId: existing?.id || state.items[0]?.id || '', qty: l.qty, price: l.price };
    });
    switchTab('invoice'); renderInvoiceLines(); updateTotals();
  }
  function deleteInvoice(id) { state.invoices = state.invoices.filter(i => i.id !== id); saveState(); renderHistory(); }

  function generatePdf() {
    const status = $('pdfStatus');
    status.textContent = 'Generating PDF...';

    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error('PDF library is not loaded. Check your internet connection, because jsPDF is loaded from CDN.');
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const inv = collectInvoice();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const left = 16;
      const right = pageWidth - 16;
      let y = 18;

      const line = (yy) => doc.line(left, yy, right, yy);
      const text = (value, x, yy, options = {}) => doc.text(String(value ?? ''), x, yy, options);
      const safe = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
      const addWrapped = (value, x, yy, maxWidth, lineHeight = 5) => {
        const lines = doc.splitTextToSize(String(value || ''), maxWidth);
        doc.text(lines, x, yy);
        return yy + (lines.length * lineHeight);
      };
      const ensurePage = (needed = 24) => {
        if (y + needed > pageHeight - 20) {
          doc.addPage();
          y = 18;
        }
      };

      doc.setFillColor(7, 26, 47);
      doc.rect(0, 0, pageWidth, 38, 'F');
      doc.setTextColor(232, 212, 175);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      text('DRIVA INVOICE OS', left, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      text('Tracing Coffee To Its Soul', left, y + 7);
      doc.setTextColor(255, 250, 240);
      doc.setFontSize(10);
      text(inv.no, right, y, { align: 'right' });
      text(`Date: ${inv.date}`, right, y + 6, { align: 'right' });
      y = 50;

      doc.setTextColor(7, 26, 47);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      text('Bill To', left, y);
      text('Invoice Details', 120, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      y += 7;
      const billY = y;
      addWrapped(inv.customerName || '-', left, y, 80);
      y += 5;
      y = addWrapped(inv.customerEmail || '', left, y, 80);
      y = addWrapped(inv.customerAddress || '', left, y, 80);
      y = billY;
      text(`Currency: ${inv.currency}`, 120, y);
      text(`Due Date: ${inv.dueDate || '-'}`, 120, y + 6);
      text(`Discount: ${inv.discountType === 'percent' ? `${inv.discountValue}%` : inv.discountType === 'fixed' ? formatMoney(inv.discountValue, inv.currency) : '-'}`, 120, y + 12);
      y = Math.max(y + 26, billY + 26);
      line(y);
      y += 10;

      doc.setFont('helvetica', 'bold');
      doc.setFillColor(232, 212, 175);
      doc.rect(left, y - 6, right - left, 9, 'F');
      doc.setTextColor(7, 26, 47);
      text('Item', left + 2, y);
      text('Qty', 105, y, { align: 'right' });
      text('Price', 142, y, { align: 'right' });
      text('Amount', right - 2, y, { align: 'right' });
      y += 8;
      doc.setFont('helvetica', 'normal');

      inv.lines.forEach((item) => {
        ensurePage(18);
        const itemLines = doc.splitTextToSize(safe(`${item.name} (${item.unit})`), 76);
        const rowHeight = Math.max(8, itemLines.length * 5 + 2);
        doc.setTextColor(16, 32, 51);
        doc.text(itemLines, left + 2, y);
        text(item.qty, 105, y, { align: 'right' });
        text(formatMoney(item.price, inv.currency), 142, y, { align: 'right' });
        text(formatMoney(item.amount, inv.currency), right - 2, y, { align: 'right' });
        y += rowHeight;
        doc.setDrawColor(230, 220, 204);
        line(y - 2);
      });

      y += 8;
      ensurePage(34);
      const labelX = 126;
      const valueX = right;
      doc.setFont('helvetica', 'normal');
      text('Subtotal', labelX, y);
      text(formatMoney(inv.subtotal, inv.currency), valueX, y, { align: 'right' });
      y += 7;
      text('Discount', labelX, y);
      text(formatMoney(inv.discount, inv.currency), valueX, y, { align: 'right' });
      y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      text('TOTAL', labelX, y);
      text(formatMoney(inv.total, inv.currency), valueX, y, { align: 'right' });
      doc.setFontSize(10);
      y += 14;

      if (inv.terms) {
        ensurePage(42);
        doc.setFont('helvetica', 'bold');
        text('Terms & Conditions', left, y);
        y += 7;
        doc.setFont('helvetica', 'normal');
        y = addWrapped(inv.terms, left, y, right - left, 5);
      }

      const filename = `${inv.no || 'driva-invoice'}.pdf`.replace(/[^a-z0-9_.-]/gi, '_');
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS) {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const opened = window.open(url, '_blank');
        if (!opened) {
          window.location.href = url;
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        doc.save(filename);
      }
      status.textContent = 'PDF generated. On iPhone, use Share → Save to Files.';
    } catch (error) {
      console.error(error);
      status.textContent = `PDF failed: ${error.message}`;
    }
  }

  function resetAll() { seedInvoiceForm(); $('pdfStatus').textContent = 'Invoice reset.'; }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function init() {
    bindTap('.nav-btn[data-tab]', (event) => {
      const tab = event.currentTarget?.dataset.tab || event.target.dataset.tab;
      if (tab) switchTab(tab);
    });
    bindTap('#addInvoiceLineBtn', () => { invoiceLines.push({ id: uid(), itemId: state.items[0]?.id || '', qty: 1, price: state.items[0]?.price || 0 }); renderInvoiceLines(); });
    bindTap('#saveItemBtn', saveItem);
    bindTap('#saveCustomerBtn', saveCustomer);
    bindTap('#saveTermsBtn', saveTerms);
    bindTap('#saveInvoiceBtn', saveInvoice);
    bindTap('#generatePdfBtn', generatePdf);
    bindTap('#resetBtn', resetAll);

    ['currency', 'discountType', 'discountValue'].forEach(id => $(id).addEventListener('input', updateTotals));
    $('termsSelect').addEventListener('change', syncTermsText);

    if (!$('invoiceNo').value) seedInvoiceForm();
    renderAll();
    setTimeout(() => $('splash')?.remove(), 2600);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
