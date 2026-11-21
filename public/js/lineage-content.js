// "Datenspur": the content of the three stages, in German and English. Technical names stay as
// they are in both languages; descriptions, example values and reasons are translated.
//   ODD     rows of four tiles, one does not belong (lvl 1 easy to 3 tricky)
//   THEMES  business descriptions and their data fields (the assistant's key words in `k`)
//   GRAPHS  small lineage graphs with missing links and impact questions
// drawRound() picks a round from these pools (each at least three times larger than a round).
// No browser imports: the content checks (node) use this file too.
import { propose } from './lineage-ai.js';

const B = (de, en) => ({ de, en });

export const TYPES = {
  date: { glyph: '31', name: B('Datum', 'Date') },
  amt: { glyph: '€', name: B('Betrag', 'Amount') },
  num: { glyph: '#', name: B('Zahl', 'Number') },
  text: { glyph: 'Aa', name: B('Text', 'Text') },
  bool: { glyph: '0|1', name: B('Ja/Nein', 'Yes/No') },
};
export const OWNERS = {
  sales: B('Vertrieb', 'Sales'),
  fin: B('Finanzen', 'Finance'),
  hr: B('Personal', 'HR'),
  log: B('Logistik', 'Logistics'),
  mkt: B('Marketing', 'Marketing'),
  it: B('IT', 'IT'),
};
const YES = B('Ja', 'Yes');
const NO = B('Nein', 'No');

// ---------- stage 1: what does not belong? ----------
// tiles: n name (text or { de, en }), ty type, ex example, ow owner; plain: a description, not a
// name. show: which metadata the tiles show. key: the metadata that decides (highlighted in
// relaxed mode). odd: index of the tile that does not belong.
const T = (n, ty, ex, ow) => ({ n, ty, ex, ow });
export const ODD = [
  // level 1: readable from the names
  { id: 'synCust', lvl: 1, cat: 'syn', show: ['ex'], odd: 3,
    tiles: [T(B('KUNDEN_NR', 'CUSTOMER_NO'), 'text', 'K-10442'), T('customer_id', 'text', 'K-10442'), T('CustNo', 'text', 'K-10442'), T(B('LIEFERDATUM', 'DELIVERY_DATE'), 'date', '2026-03-14')],
    why: B('Drei Namen für die Kundennummer. Ein Lieferdatum.', 'Three names for the customer number. One delivery date.') },
  { id: 'synRev', lvl: 1, cat: 'syn', show: ['ex'], odd: 3,
    tiles: [T(B('UMSATZ', 'REVENUE'), 'amt', B('1.250,00 €', '€1,250.00')), T('revenue_amt', 'amt', B('1.250,00 €', '€1,250.00')), T('SalesTotal', 'amt', B('1.250,00 €', '€1,250.00')), T(B('PLZ', 'ZIP_CODE'), 'text', '04109')],
    why: B('Drei Namen für den Umsatz. Eine Postleitzahl.', 'Three names for revenue. One postal code.') },
  { id: 'synBirth', lvl: 1, cat: 'syn', show: ['ex'], odd: 3,
    tiles: [T(B('GEBURTSDATUM', 'DATE_OF_BIRTH'), 'date', '1988-04-12'), T('birth_dt', 'date', '1988-04-12'), T('DOB', 'date', '1988-04-12'), T(B('RECHNUNGS_NR', 'INVOICE_NO'), 'text', 'R-2026-0311')],
    why: B('Drei Namen für das Geburtsdatum. Eine Rechnungsnummer.', 'Three names for the date of birth. One invoice number.') },
  { id: 'typeDate', lvl: 1, cat: 'type', show: ['ty', 'ex'], key: 'ty', odd: 3,
    tiles: [T(B('BESTELLDATUM', 'ORDER_DATE'), 'date', '2026-03-02'), T(B('LIEFERDATUM', 'DELIVERY_DATE'), 'date', '2026-03-14'), T(B('RECHNUNGSDATUM', 'INVOICE_DATE'), 'date', '2026-03-16'), T(B('RECHNUNGSBETRAG', 'INVOICE_AMOUNT'), 'amt', B('1.487,50 €', '€1,487.50'))],
    why: B('Drei Datumsfelder. Ein Betrag.', 'Three date fields. One amount.') },
  { id: 'typeAmt', lvl: 1, cat: 'type', show: ['ty', 'ex'], key: 'ty', odd: 3,
    tiles: [T(B('NETTO', 'NET'), 'amt', B('1.250,00 €', '€1,250.00')), T(B('STEUER', 'TAX'), 'amt', B('237,50 €', '€237.50')), T(B('BRUTTO', 'GROSS'), 'amt', B('1.487,50 €', '€1,487.50')), T(B('WAEHRUNG', 'CURRENCY'), 'text', 'EUR')],
    why: B('Drei Beträge. Die Währung ist ein Text.', 'Three amounts. The currency is a text.') },
  { id: 'ownHr', lvl: 1, cat: 'owner', show: ['ow'], key: 'ow', odd: 3,
    tiles: [T(B('GEHALT', 'SALARY'), 'amt', '', 'hr'), T(B('URLAUBSTAGE', 'VACATION_DAYS'), 'num', '', 'hr'), T(B('EINTRITTSDATUM', 'HIRE_DATE'), 'date', '', 'hr'), T(B('LAGERPLATZ', 'STORAGE_BIN'), 'text', '', 'log')],
    why: B('Drei Felder aus dem Personalwesen. Der Lagerplatz gehört der Logistik.', 'Three fields from HR. The storage bin belongs to logistics.') },
  { id: 'ownFin', lvl: 1, cat: 'owner', show: ['ow'], key: 'ow', odd: 3,
    tiles: [T(B('KONTO_NR', 'ACCOUNT_NO'), 'text', '', 'fin'), T(B('BUCHUNGSDATUM', 'POSTING_DATE'), 'date', '', 'fin'), T(B('KOSTENSTELLE', 'COST_CENTER'), 'text', '', 'fin'), T(B('KAMPAGNE', 'CAMPAIGN'), 'text', '', 'mkt')],
    why: B('Drei Felder aus den Finanzen. Die Kampagne gehört dem Marketing.', 'Three fields from finance. The campaign belongs to marketing.') },
  { id: 'ownSales', lvl: 1, cat: 'owner', show: ['ow'], key: 'ow', odd: 3,
    tiles: [T(B('ANGEBOT_NR', 'QUOTE_NO'), 'text', '', 'sales'), T(B('RABATT', 'DISCOUNT'), 'num', '', 'sales'), T(B('VERTRIEBSGEBIET', 'SALES_TERRITORY'), 'text', '', 'sales'), T(B('KRANKENTAGE', 'SICK_DAYS'), 'num', '', 'hr')],
    why: B('Drei Felder aus dem Vertrieb. Krankentage gehören dem Personalwesen.', 'Three fields from sales. Sick days belong to HR.') },

  // level 2: think about what the data is
  { id: 'piiA', lvl: 2, cat: 'pii', show: ['ex'], odd: 3,
    tiles: [T(B('E_MAIL', 'E_MAIL'), 'text', 'j.okafor@example.org'), T(B('GEBURTSDATUM', 'DATE_OF_BIRTH'), 'date', '1988-04-12'), T(B('TELEFON', 'PHONE'), 'text', '+49 30 5550142'), T(B('ARTIKEL_NR', 'ITEM_NO'), 'text', 'A-88310')],
    why: B('Drei Felder sagen etwas über einen Menschen: besonders zu schützen. Eine Artikelnummer tut das nicht.', 'Three fields say something about a person: to be protected. An item number does not.') },
  { id: 'piiB', lvl: 2, cat: 'pii', show: ['ex'], odd: 3,
    tiles: [T(B('VORNAME', 'FIRST_NAME'), 'text', 'Jana'), T('IBAN', 'text', 'DE•• •••• •••• 4821'), T(B('WOHNORT', 'HOME_TOWN'), 'text', 'Leipzig'), T(B('LAGERBESTAND', 'STOCK_LEVEL'), 'num', '412')],
    why: B('Drei personenbezogene Felder. Der Lagerbestand hat mit keiner Person zu tun.', 'Three personal data fields. The stock level is about no person.') },
  { id: 'piiC', lvl: 2, cat: 'pii', show: ['ex'], odd: 3,
    tiles: [T(B('ANSPRECHPERSON', 'CONTACT_PERSON'), 'text', 'Jana Okafor'), T(B('PRIVATADRESSE', 'HOME_ADDRESS'), 'text', B('Lindenweg 4, Leipzig', '4 Lindenweg, Leipzig')), T(B('GEBURTSJAHR', 'YEAR_OF_BIRTH'), 'num', '1988'), T(B('PRODUKTFARBE', 'PRODUCT_COLOR'), 'text', B('blau', 'blue'))],
    why: B('Drei Felder mit Personenbezug. Die Farbe eines Produkts ist nicht geheim.', 'Three fields about a person. The color of a product is no secret.') },
  { id: 'descA', lvl: 2, cat: 'desc', show: [], odd: 3,
    tiles: [
      { plain: B('Tag, an dem die Rechnung gestellt wurde', 'Day the invoice was issued') },
      { plain: B('Kunde hat dem Newsletter zugestimmt: Ja oder Nein', 'Customer agreed to the newsletter: yes or no') },
      { plain: B('Nettobetrag der Bestellung in Euro', 'Net amount of the order in euros') },
      { plain: B('Feld 7', 'Field 7') }],
    why: B('Drei Beschreibungen sagen, was im Feld steht. „Feld 7“ sagt nichts.', 'Three descriptions say what is in the field. "Field 7" says nothing.') },
  { id: 'descB', lvl: 2, cat: 'desc', show: [], odd: 3,
    tiles: [
      { plain: B('Anzahl der Tage von der Bestellung bis zur Lieferung', 'Number of days from order to delivery') },
      { plain: B('Land des Kunden als Kürzel aus zwei Buchstaben', 'Country of the customer as a two-letter code') },
      { plain: B('Zeitpunkt der letzten Änderung am Datensatz', 'Time of the last change to the record') },
      { plain: B('Diverses', 'Miscellaneous') }],
    why: B('Drei Beschreibungen helfen beim Finden. „Diverses“ hilft niemandem.', 'Three descriptions help you find things. "Miscellaneous" helps no one.') },
  { id: 'descC', lvl: 2, cat: 'desc', show: [], odd: 3,
    tiles: [
      { plain: B('Monatsgehalt brutto in Euro', 'Gross monthly salary in euros') },
      { plain: B('Nummer der Filiale, in der gekauft wurde', 'Number of the store where the purchase was made') },
      { plain: B('Gewicht des Pakets in Kilogramm', 'Weight of the parcel in kilograms') },
      { plain: B('Wert', 'Value') }],
    why: B('Drei Beschreibungen nennen Inhalt und Einheit. „Wert“ könnte alles sein.', 'Three descriptions name content and unit. "Value" could be anything.') },
  { id: 'format', lvl: 2, cat: 'format', show: ['ex'], key: 'ex', odd: 3,
    tiles: [T('DLV_DT', 'date', '2026-03-14'), T('START_DT', 'date', '2026-01-31'), T('END_DT', 'date', '2025-12-24'), T('LEGACY_DT', 'date', '14.03.26')],
    why: B('Drei Daten im Format Jahr-Monat-Tag. Eines tanzt aus der Reihe: 14.03.26.', 'Three dates as year-month-day. One steps out of line: 14.03.26.') },
  { id: 'synCountry', lvl: 2, cat: 'syn2', show: ['ex'], key: 'ex', odd: 3,
    tiles: [T(B('LAND', 'COUNTRY'), 'text', 'CH'), T('country_code', 'text', 'CH'), T('Ctry', 'text', 'CH'), T(B('SPRACHE', 'LANGUAGE'), 'text', B('Französisch', 'French'))],
    why: B('Drei Namen für das Land. Die Sprache ist etwas anderes: Die Schweiz hat vier.', 'Three names for the country. The language is something else: Switzerland has four.') },

  // level 3: the name misleads, the metadata line decides
  { id: 'trickId', lvl: 3, cat: 'trickA', show: ['ty', 'ex'], key: 'ty', odd: 3,
    tiles: [T(B('KUNDE_ID', 'CUSTOMER_ID'), 'num', '10442'), T(B('ARTIKEL_ID', 'ITEM_ID'), 'num', '88310'), T(B('FILIALE_ID', 'STORE_ID'), 'num', '12'), T('VALID_ID', 'bool', YES)],
    why: B('Drei Schlüssel, die etwas eindeutig benennen. VALID_ID heißt nur so: Es ist ein Ja/Nein-Feld.', 'Three keys that identify something. VALID_ID only sounds like one: it is a yes/no field.') },
  { id: 'trickEur', lvl: 3, cat: 'trickB', show: ['ty', 'ex'], key: 'ty', odd: 3,
    tiles: [T(B('UMSATZ_EUR', 'REVENUE_EUR'), 'amt', B('1.250,00 €', '€1,250.00')), T(B('RABATT_EUR', 'DISCOUNT_EUR'), 'amt', B('50,00 €', '€50.00')), T(B('STEUER_EUR', 'TAX_EUR'), 'amt', B('237,50 €', '€237.50')), T(B('KURS_EUR', 'RATE_EUR'), 'num', B('1,0842', '1.0842'))],
    why: B('Drei Geldbeträge in Euro. KURS_EUR ist ein Wechselkurs: eine Zahl, kein Geld.', 'Three amounts of money in euros. RATE_EUR is an exchange rate: a number, not money.') },
  { id: 'trickYear', lvl: 3, cat: 'trickC', show: ['ty', 'ex'], key: 'ty', odd: 3,
    tiles: [T(B('GEBURTSDATUM', 'DATE_OF_BIRTH'), 'date', '1988-04-12'), T(B('EINTRITT', 'HIRED'), 'date', '2019-09-01'), T(B('LETZTE_BESTELLUNG', 'LAST_ORDER'), 'date', '2026-03-02'), T(B('JAHRGANG', 'BIRTH_YEAR'), 'num', '1988')],
    why: B('Drei Datumsfelder. JAHRGANG klingt nach Datum, ist aber nur eine Zahl.', 'Three date fields. BIRTH_YEAR sounds like a date, but it is just a number.') },
  { id: 'trickText', lvl: 3, cat: 'trickD', show: ['ty', 'ex'], key: 'ty', odd: 3,
    tiles: [T(B('PLZ', 'ZIP_CODE'), 'text', '04109'), T(B('HAUSNUMMER', 'HOUSE_NO'), 'text', '12a'), T(B('KONTO_NR', 'ACCOUNT_NO'), 'text', '0048213'), T(B('STUECKZAHL', 'QUANTITY'), 'num', '12')],
    why: B('Drei Felder sehen nach Zahl aus, sind aber Text: Mit einer Postleitzahl rechnet niemand. Nur die Stückzahl ist eine Zahl.', 'Three fields look like numbers but are text: nobody adds up postal codes. Only the quantity is a number.') },
  { id: 'trickOwner', lvl: 3, cat: 'trickE', show: ['ow'], key: 'ow', odd: 3,
    tiles: [T(B('KUNDEN_UMSATZ', 'CUSTOMER_REVENUE'), 'amt', '', 'sales'), T(B('KUNDEN_RABATT', 'CUSTOMER_DISCOUNT'), 'num', '', 'sales'), T(B('KUNDEN_BESUCHE', 'CUSTOMER_VISITS'), 'num', '', 'sales'), T(B('KUNDEN_BONITAET', 'CUSTOMER_CREDIT_SCORE'), 'text', '', 'fin')],
    why: B('Alle vier klingen nach Vertrieb. Die Bonität aber prüft und pflegt die Finanzabteilung.', 'All four sound like sales. But the credit score is checked and kept by finance.') },
  { id: 'trickFlag', lvl: 3, cat: 'trickF', show: ['ty', 'ex'], key: 'ty', odd: 3,
    tiles: [T(B('AKTIV', 'ACTIVE'), 'bool', YES), T(B('GESPERRT', 'BLOCKED'), 'bool', NO), T('NEWSLETTER', 'bool', YES), T('STATUS', 'text', B('offen', 'open'))],
    why: B('Drei Ja/Nein-Felder. STATUS ist ein Text mit vielen möglichen Werten.', 'Three yes/no fields. STATUS is a text with many possible values.') },
  { id: 'trickName', lvl: 3, cat: 'trickG', show: ['ex'], key: 'ex', odd: 3,
    tiles: [T('KD_NAME', 'text', 'Nordwind GmbH'), T('CUSTOMER_NAME', 'text', 'Nordwind GmbH'), T(B('Kundenname', 'CustName'), 'text', 'Nordwind GmbH'), T('CONTACT_NAME', 'text', 'Jana Okafor')],
    why: B('Drei Namen für den Kunden, also die Firma. CONTACT_NAME ist die Ansprechperson.', 'Three names for the customer, the company. CONTACT_NAME is the contact person.') },
  { id: 'trickUnit', lvl: 3, cat: 'trickH', show: ['ex'], key: 'ex', odd: 3,
    tiles: [T(B('GEWICHT', 'WEIGHT'), 'num', B('2,4 kg', '2.4 kg')), T(B('NETTOGEWICHT', 'NET_WEIGHT'), 'num', B('2,1 kg', '2.1 kg')), T(B('VERSANDGEWICHT', 'SHIPPING_WEIGHT'), 'num', B('2,6 kg', '2.6 kg')), T(B('GEWICHTUNG', 'WEIGHTING'), 'num', B('0,35', '0.35'))],
    why: B('Drei Gewichte in Kilogramm. GEWICHTUNG ist ein Faktor ohne Einheit.', 'Three weights in kilograms. WEIGHTING is a factor without a unit.') },
];

// ---------- stage 2: connect description and data field ----------
// fields: name, type, example, owner, is (what the field really is: the reason shown when a line
// is wrong). pairs: d description, k the assistant's key words, f the field, must (always on the
// board: a false friend and the description its field really belongs to). decoy: one field too many.
const F = (n, ty, ex, ow, is) => ({ n, ty, ex, ow, is });
export const THEMES = [
  { id: 'order',
    fields: {
      ORDER_DT: F('ORDER_DT', 'date', '2026-03-02', 'sales', B('der Tag der Bestellung', 'the day of the order')),
      ARRIVAL_DT: F('ARRIVAL_DT', 'date', '2026-03-14', 'log', B('der Tag, an dem die Ware ankommt', 'the day the goods arrive')),
      ORD_AMT: F('ORD_AMT', 'amt', B('1.250,00 €', '€1,250.00'), 'sales', B('der Wert der Bestellung', 'the value of the order')),
      CUST_NO: F('CUST_NO', 'text', 'K-10442', 'sales', B('die Nummer des Kunden', 'the number of the customer')),
      ORD_STAT: F('ORD_STAT', 'text', B('versandt', 'shipped'), 'log', B('der Stand der Bestellung', 'the state of the order')),
      INV_DT: F('INV_DT', 'date', '2026-03-16', 'fin', B('der Tag der Rechnung', 'the day of the invoice')),
    },
    pairs: [
      { d: B('Tag, an dem der Kunde bestellt hat', 'Day the customer placed the order'), k: 'date customer order', f: 'ORDER_DT', must: true },
      { d: B('Tag, an dem die bestellte Ware beim Kunden ankommt', 'Day the ordered goods arrive at the customer'), k: 'date order goods customer', f: 'ARRIVAL_DT', must: true },
      { d: B('Gesamtwert der Bestellung in Euro', 'Total value of the order in euros'), k: 'amount order', f: 'ORD_AMT' },
      { d: B('Nummer, unter der wir den Kunden führen', 'Number under which we keep the customer'), k: 'id customer', f: 'CUST_NO' },
      { d: B('Wie weit die Bestellung gerade ist', 'How far along the order is'), k: 'order', f: 'ORD_STAT' },
    ],
    decoy: 'INV_DT' },
  { id: 'customer',
    fields: {
      CUST_NAME: F('CUST_NAME', 'text', 'Nordwind GmbH', 'sales', B('der Name der Firma', 'the name of the company')),
      CONTACT_NAME: F('CONTACT_NAME', 'text', 'Jana Okafor', 'sales', B('die Ansprechperson beim Kunden', 'the contact person at the customer')),
      CUST_SINCE_DT: F('CUST_SINCE_DT', 'date', '2019-05-20', 'sales', B('der Tag, seit dem jemand Kunde ist', 'the day someone became a customer')),
      SEGMENT: F('SEGMENT', 'text', B('Großkunde', 'Key account'), 'mkt', B('die Kundengruppe', 'the customer group')),
      CTRY_CD: F('CTRY_CD', 'text', 'DE', 'sales', B('das Land als Kürzel', 'the country as a code')),
      CONTACT_MAIL: F('CONTACT_MAIL', 'text', 'j.okafor@example.org', 'sales', B('die E-Mail der Ansprechperson', 'the e-mail of the contact person')),
    },
    pairs: [
      { d: B('Name des Kunden, wie er im Vertrag steht', 'Name of the customer as written in the contract'), k: 'name customer contract', f: 'CUST_NAME', must: true },
      { d: B('Name der Person, mit der wir beim Kunden sprechen', 'Name of the person we talk to at the customer'), k: 'name person customer', f: 'CONTACT_NAME', must: true },
      { d: B('Tag, seit dem die Firma bei uns Kunde ist', 'Day since which the company has been our customer'), k: 'date company customer', f: 'CUST_SINCE_DT' },
      { d: B('Gruppe, in die wir den Kunden einordnen', 'Group we sort the customer into'), k: 'group customer', f: 'SEGMENT' },
      { d: B('Land des Kunden als Kürzel aus zwei Buchstaben', 'Country of the customer as a two-letter code'), k: 'country customer code', f: 'CTRY_CD' },
    ],
    decoy: 'CONTACT_MAIL' },
  { id: 'staff',
    fields: {
      HIRE_DT: F('HIRE_DT', 'date', '2019-09-01', 'hr', B('der erste Arbeitstag', 'the first day at work')),
      BIRTH_DT: F('BIRTH_DT', 'date', '1988-04-12', 'hr', B('der Geburtstag', 'the birthday')),
      SAL_GRS: F('SAL_GRS', 'amt', B('4.200,00 €', '€4,200.00'), 'hr', B('das Gehalt vor Steuern', 'the salary before tax')),
      MGR_ID: F('MGR_ID', 'text', 'E-0071', 'hr', B('die Personalnummer der Führungskraft', 'the staff number of the manager')),
      EMP_ID: F('EMP_ID', 'text', 'E-0142', 'hr', B('die eigene Personalnummer', 'the person\'s own staff number')),
      DEPT_CD: F('DEPT_CD', 'text', 'LOG', 'hr', B('das Kürzel der Abteilung', 'the code of the department')),
      SAL_NET: F('SAL_NET', 'amt', B('2.710,00 €', '€2,710.00'), 'hr', B('das Gehalt nach Steuern', 'the salary after tax')),
    },
    pairs: [
      { d: B('Eigene Personalnummer im Unternehmen', 'A person\'s own staff number in the company'), k: 'employee id company', f: 'EMP_ID', must: true },
      { d: B('Personalnummer der Person, an die jemand berichtet', 'Staff number of the person someone reports to'), k: 'employee id person', f: 'MGR_ID', must: true },
      { d: B('Erster Arbeitstag im Unternehmen', 'First day at work in the company'), k: 'date work company', f: 'HIRE_DT' },
      { d: B('Geburtstag der Mitarbeiterin oder des Mitarbeiters', 'Birthday of the employee'), k: 'birth date employee', f: 'BIRTH_DT' },
      { d: B('Monatsgehalt vor Steuern und Abgaben', 'Monthly salary before tax and deductions'), k: 'salary month', f: 'SAL_GRS' },
      { d: B('Kürzel der Abteilung', 'Code of the department'), k: 'code department', f: 'DEPT_CD' },
    ],
    decoy: 'SAL_NET' },
  { id: 'invoice',
    fields: {
      INV_NO: F('INV_NO', 'text', 'R-2026-0311', 'fin', B('die Nummer der Rechnung', 'the number of the invoice')),
      INV_DT: F('INV_DT', 'date', '2026-03-16', 'fin', B('der Tag, an dem die Rechnung geschrieben wurde', 'the day the invoice was written')),
      DUE_DT: F('DUE_DT', 'date', '2026-04-15', 'fin', B('der Tag, bis zu dem zu zahlen ist', 'the day by which to pay')),
      PAY_DT: F('PAY_DT', 'date', '2026-04-09', 'fin', B('der Tag, an dem das Geld einging', 'the day the money came in')),
      NET_AMT: F('NET_AMT', 'amt', B('1.250,00 €', '€1,250.00'), 'fin', B('der Betrag ohne Steuer', 'the amount without tax')),
      TAX_AMT: F('TAX_AMT', 'amt', B('237,50 €', '€237.50'), 'fin', B('nur die Steuer', 'the tax alone')),
      GRS_AMT: F('GRS_AMT', 'amt', B('1.487,50 €', '€1,487.50'), 'fin', B('der Betrag mit Steuer', 'the amount with tax')),
    },
    pairs: [
      { d: B('Tag, an dem die Rechnung geschrieben wurde', 'Day the invoice was written'), k: 'date invoice', f: 'INV_DT', must: true },
      { d: B('Tag, bis zu dem die Rechnung bezahlt sein muss', 'Day by which the invoice must be paid'), k: 'date invoice', f: 'DUE_DT', must: true },
      { d: B('Rechnungsbetrag ohne Umsatzsteuer', 'Invoice amount without sales tax'), k: 'invoice amount tax', f: 'NET_AMT' },
      { d: B('Betrag der Umsatzsteuer auf der Rechnung', 'Amount of sales tax on the invoice'), k: 'amount tax invoice', f: 'TAX_AMT' },
      { d: B('Nummer, die auf der Rechnung steht', 'Number printed on the invoice'), k: 'id invoice', f: 'INV_NO' },
      { d: B('Tag, an dem das Geld bei uns eingegangen ist', 'Day the money reached us'), k: 'date money', f: 'PAY_DT' },
    ],
    decoy: 'GRS_AMT' },
  { id: 'stock',
    fields: {
      PROD_NO: F('PROD_NO', 'text', 'A-88310', 'log', B('die Artikelnummer', 'the item number')),
      STOCK_QTY: F('STOCK_QTY', 'num', '412', 'log', B('die Stückzahl im Lager', 'the number of pieces in stock')),
      ORD_QTY: F('ORD_QTY', 'num', '3', 'sales', B('die Stückzahl, die ein Kunde bestellt hat', 'the number of pieces a customer ordered')),
      MIN_QTY: F('MIN_QTY', 'num', '50', 'log', B('die Menge, ab der nachbestellt wird', 'the level at which stock is reordered')),
      UNIT_PRICE: F('UNIT_PRICE', 'amt', B('19,90 €', '€19.90'), 'sales', B('der Preis für ein Stück', 'the price of one piece')),
      WH_CD: F('WH_CD', 'text', 'LEJ-2', 'log', B('das Kürzel des Lagers', 'the code of the warehouse')),
      PROD_NAME: F('PROD_NAME', 'text', B('Thermobecher 0,4 l', 'Travel mug 0.4 l'), 'sales', B('der Name des Artikels', 'the name of the item')),
    },
    pairs: [
      { d: B('Stückzahl, die der Kunde bestellt hat', 'Number of pieces the customer ordered'), k: 'quantity customer order', f: 'ORD_QTY', must: true },
      { d: B('Menge, ab der wir Ware nachbestellen', 'Level at which we order new goods'), k: 'quantity order goods', f: 'MIN_QTY', must: true },
      { d: B('Stückzahl, die gerade im Lager liegt', 'Number of pieces in the warehouse right now'), k: 'quantity warehouse', f: 'STOCK_QTY' },
      { d: B('Preis für ein einzelnes Stück', 'Price of a single piece'), k: 'price unit', f: 'UNIT_PRICE' },
      { d: B('Kürzel des Lagers, aus dem geliefert wird', 'Code of the warehouse that ships the goods'), k: 'code warehouse delivery', f: 'WH_CD' },
      { d: B('Nummer, unter der der Artikel geführt wird', 'Number under which the item is kept'), k: 'id product', f: 'PROD_NO' },
    ],
    decoy: 'PROD_NAME' },
  { id: 'mailing',
    fields: {
      CAMP_ID: F('CAMP_ID', 'text', 'C-2026-07', 'mkt', B('die Kennung der Kampagne', 'the ID of the campaign')),
      SENT_CNT: F('SENT_CNT', 'num', B('12.000', '12,000'), 'mkt', B('die Zahl der verschickten Mails', 'the number of mails sent')),
      OPEN_RATE: F('OPEN_RATE', 'num', B('38,2 %', '38.2%'), 'mkt', B('der Anteil der geöffneten Mails', 'the share of mails opened')),
      OPEN_CNT: F('OPEN_CNT', 'num', B('4.584', '4,584'), 'mkt', B('die Zahl der geöffneten Mails', 'the number of mails opened')),
      CLICK_CNT: F('CLICK_CNT', 'num', B('1.140', '1,140'), 'mkt', B('die Zahl der Klicks', 'the number of clicks')),
      UNSUB_DT: F('UNSUB_DT', 'date', '2026-02-11', 'mkt', B('der Tag der Abmeldung', 'the day of unsubscribing')),
    },
    pairs: [
      { d: B('Anzahl der Mails, die geöffnet wurden', 'Number of mails that were opened'), k: 'count mail open', f: 'OPEN_CNT', must: true },
      { d: B('Wie viele von hundert Mails geöffnet wurden', 'How many in a hundred mails were opened'), k: 'count mail open', f: 'OPEN_RATE', must: true },
      { d: B('Anzahl der verschickten Mails einer Kampagne', 'Number of mails sent in a campaign'), k: 'count sent mail campaign', f: 'SENT_CNT' },
      { d: B('Anzahl der Klicks auf Links in der Mail', 'Number of clicks on links in the mail'), k: 'count click link mail', f: 'CLICK_CNT' },
      { d: B('Kennung der Kampagne', 'ID of the campaign'), k: 'id campaign', f: 'CAMP_ID' },
    ],
    decoy: 'UNSUB_DT' },
  { id: 'shipping',
    fields: {
      SHIP_DT: F('SHIP_DT', 'date', '2026-03-12', 'log', B('der Tag, an dem das Paket das Lager verlässt', 'the day the parcel leaves the warehouse')),
      DLV_DT: F('DLV_DT', 'date', '2026-03-14', 'log', B('der Tag der Zustellung', 'the day the parcel is handed over')),
      SHIP_NO: F('SHIP_NO', 'text', 'S-771204', 'log', B('die Sendungsnummer', 'the tracking number')),
      WEIGHT_KG: F('WEIGHT_KG', 'num', B('2,4', '2.4'), 'log', B('das Gewicht in Kilogramm', 'the weight in kilograms')),
      CARRIER_CD: F('CARRIER_CD', 'text', 'NORD', 'log', B('das Kürzel des Paketdienstes', 'the code of the carrier')),
      DLV_ADDR: F('DLV_ADDR', 'text', B('Lindenweg 4, Leipzig', '4 Lindenweg, Leipzig'), 'log', B('die Lieferadresse', 'the delivery address')),
    },
    pairs: [
      { d: B('Tag der Zustellung beim Empfänger', 'Day of delivery to the recipient'), k: 'date delivery recipient', f: 'DLV_DT', must: true },
      { d: B('Tag, an dem wir die Lieferung losschicken', 'Day we send the delivery on its way'), k: 'date delivery', f: 'SHIP_DT', must: true },
      { d: B('Nummer, mit der man die Sendung verfolgt', 'Number used to track the shipment'), k: 'id shipping', f: 'SHIP_NO' },
      { d: B('Gewicht des Pakets in Kilogramm', 'Weight of the parcel in kilograms'), k: 'weight parcel kg', f: 'WEIGHT_KG' },
      { d: B('Kürzel des Paketdienstes', 'Code of the parcel carrier'), k: 'code carrier', f: 'CARRIER_CD' },
    ],
    decoy: 'DLV_ADDR' },
  { id: 'web',
    fields: {
      VISIT_ID: F('VISIT_ID', 'text', 'V-000931', 'it', B('die Kennung eines einzelnen Besuchs', 'the ID of a single visit')),
      VISITOR_ID: F('VISITOR_ID', 'text', 'U-5521', 'it', B('die Kennung der Person', 'the ID of the person')),
      VISIT_TS: F('VISIT_TS', 'date', '2026-03-02 14:31', 'it', B('der Beginn des Besuchs', 'the start of the visit')),
      DURATION_SEC: F('DURATION_SEC', 'num', '184', 'it', B('die Dauer in Sekunden', 'the duration in seconds')),
      DEVICE: F('DEVICE', 'text', B('Handy', 'phone'), 'it', B('das Gerät', 'the device')),
      PAGE_URL: F('PAGE_URL', 'text', B('/produkte/becher', '/products/mugs'), 'it', B('die Adresse der Seite', 'the address of the page')),
    },
    pairs: [
      { d: B('Kennung eines einzelnen Besuchs', 'ID of a single visit'), k: 'id visit', f: 'VISIT_ID', must: true },
      { d: B('Kennung der Person, die die Seite besucht', 'ID of the person who visits the page'), k: 'id person visit', f: 'VISITOR_ID', must: true },
      { d: B('Zeitpunkt, zu dem der Besuch begann', 'Time the visit began'), k: 'time visit', f: 'VISIT_TS' },
      { d: B('Dauer des Besuchs in Sekunden', 'Length of the visit in seconds'), k: 'duration visit second', f: 'DURATION_SEC' },
      { d: B('Gerät, mit dem die Seite besucht wurde', 'Device used to visit the page'), k: 'device page', f: 'DEVICE' },
    ],
    decoy: 'PAGE_URL' },
  { id: 'contract',
    fields: {
      CONTRACT_NO: F('CONTRACT_NO', 'text', 'V-20417', 'sales', B('die Nummer des Vertrags', 'the number of the contract')),
      START_DT: F('START_DT', 'date', '2025-07-01', 'sales', B('der erste Tag des Vertrags', 'the first day of the contract')),
      END_DT: F('END_DT', 'date', '2027-06-30', 'sales', B('der letzte Tag des Vertrags', 'the last day of the contract')),
      NOTICE_DAYS: F('NOTICE_DAYS', 'num', '90', 'sales', B('die Kündigungsfrist in Tagen', 'the notice period in days')),
      MONTHLY_FEE: F('MONTHLY_FEE', 'amt', B('49,00 €', '€49.00'), 'fin', B('die Gebühr pro Monat', 'the fee per month')),
      AUTO_RENEW: F('AUTO_RENEW', 'bool', YES, 'sales', B('ob sich der Vertrag von selbst verlängert', 'whether the contract renews by itself')),
      SIGN_DT: F('SIGN_DT', 'date', '2025-06-12', 'sales', B('der Tag der Unterschrift', 'the day of signing')),
    },
    pairs: [
      { d: B('Tag, an dem der Vertrag beginnt', 'Day the contract starts'), k: 'date contract start', f: 'START_DT', must: true },
      { d: B('Tag, an dem der Vertrag unterschrieben wurde', 'Day the contract was signed'), k: 'date contract start', f: 'SIGN_DT', must: true },
      { d: B('Tag, an dem der Vertrag ausläuft', 'Day the contract runs out'), k: 'date contract', f: 'END_DT' },
      { d: B('Frist für die Kündigung in Tagen', 'Notice period in days'), k: 'notice day', f: 'NOTICE_DAYS' },
      { d: B('Gebühr pro Monat', 'Fee per month'), k: 'month fee', f: 'MONTHLY_FEE' },
      { d: B('Verlängert sich der Vertrag von selbst? Ja oder Nein', 'Does the contract renew by itself? Yes or no'), k: 'renew contract auto', f: 'AUTO_RENEW' },
    ],
    decoy: 'CONTRACT_NO' },
];

// ---------- stage 3: the data trail ----------
// nodes: id, col (0 source, 1 transformation, 2 warehouse, 3 report), n name, m what it holds.
// edges: every link of the finished graph. missing: the links the player adds, each with what
// the downstream node needs (need) and the assistant's key words (k). impact: a source changes,
// which reports are affected (hit).
const N = (id, col, n, m) => ({ id, col, n, m });
export const GRAPHS = [
  { id: 'revenue',
    nodes: [
      N('s1', 0, 'ERP.ORDERS', B('Bestellungen: Betrag, Kunde, Tag', 'Orders: amount, customer, day')),
      N('s2', 0, 'CRM.CUSTOMER', B('Kunden: Name und Region', 'Customers: name and region')),
      N('s3', 0, 'GEO.REGION_LIST', B('Liste aller Regionen mit Kürzel', 'List of all regions with codes')),
      N('t1', 1, 'JOIN_ORDER_CUST', B('hängt an jede Bestellung die Region des Kunden', 'adds the customer\'s region to every order')),
      N('t2', 1, 'MAP_REGION_NAMES', B('übersetzt Regionskürzel in Namen', 'turns region codes into names')),
      N('w1', 2, 'FACT_SALES_MONTHLY', B('Umsatz je Region und Monat', 'Revenue by region and month')),
      N('w2', 2, 'DIM_REGION', B('Regionen mit ihren Namen', 'Regions with their names')),
      N('r1', 3, B('Umsatz pro Region', 'Revenue by region')),
      N('r2', 3, B('Umsatz im Jahresverlauf', 'Revenue over the year')),
      N('r3', 3, B('Verzeichnis der Regionen', 'Directory of regions')),
    ],
    edges: [['s1', 't1'], ['s2', 't1'], ['s3', 't2'], ['t1', 'w1'], ['t2', 'w2'], ['w1', 'r1'], ['w1', 'r2'], ['w2', 'r3']],
    missing: [
      { e: ['w1', 'r1'], need: B('Umsatz je Region', 'revenue by region'), k: 'revenue region' },
      { e: ['t1', 'w1'], need: B('Bestellungen mit Region des Kunden', 'orders with the customer\'s region'), k: 'order region customer' },
      { e: ['s1', 't1'], need: B('Bestellungen mit Betrag', 'orders with amounts'), k: 'order amount' },
      { e: ['s2', 't1'], need: B('die Region jedes Kunden', 'the region of every customer'), k: 'region customer' },
    ],
    impact: [
      { src: 's2', field: 'REGION', hit: ['r1', 'r2'] },
      { src: 's3', field: 'REGION_CD', hit: ['r3'] },
      { src: 's1', field: 'AMOUNT', hit: ['r1', 'r2'] },
    ] },
  { id: 'receivables',
    nodes: [
      N('s1', 0, 'FIN.AR_ITEMS', B('Rechnungen: Betrag und fällig am', 'Invoices: amount and due date')),
      N('s2', 0, 'BANK.PAYMENTS', B('Zahlungseingänge vom Konto', 'Payments received on the account')),
      N('s3', 0, 'FIN.INVOICE_TEMPLATES', B('Vorlagen für das Aussehen von Rechnungen', 'Templates for the look of invoices')),
      N('t1', 1, 'MATCH_INV_PAY', B('ordnet jeder Rechnung ihre Zahlung zu', 'matches every invoice with its payment')),
      N('t2', 1, 'LOAD_TEMPLATES', B('lädt die Vorlagen unverändert', 'loads the templates unchanged')),
      N('w1', 2, 'FACT_RECEIVABLES', B('je Rechnung: bezahlt oder offen', 'per invoice: paid or open')),
      N('w2', 2, 'DIM_TEMPLATE', B('Vorlagen mit Namen', 'Templates with names')),
      N('r1', 3, B('Offene Rechnungen', 'Open invoices')),
      N('r2', 3, B('Zahlungsmoral der Kunden', 'How promptly customers pay')),
      N('r3', 3, B('Übersicht der Vorlagen', 'Overview of templates')),
    ],
    edges: [['s1', 't1'], ['s2', 't1'], ['s3', 't2'], ['t1', 'w1'], ['t2', 'w2'], ['w1', 'r1'], ['w1', 'r2'], ['w2', 'r3']],
    missing: [
      { e: ['w1', 'r1'], need: B('je Rechnung: bezahlt oder offen', 'per invoice: paid or open'), k: 'open paid' },
      { e: ['t1', 'w1'], need: B('Rechnungen mit ihrer Zahlung', 'invoices with their payment'), k: 'invoice payment' },
      { e: ['s1', 't1'], need: B('die Rechnungen', 'the invoices'), k: 'invoice' },
      { e: ['s2', 't1'], need: B('die Zahlungseingänge', 'the payments received'), k: 'payment' },
    ],
    impact: [
      { src: 's2', field: 'PAY_DT', hit: ['r1', 'r2'] },
      { src: 's3', field: 'LAYOUT', hit: ['r3'] },
      { src: 's1', field: 'DUE_DT', hit: ['r1', 'r2'] },
    ] },
  { id: 'stockdays',
    nodes: [
      N('s1', 0, 'WMS.ON_HAND', B('Bestand heute je Artikel und Lager', 'Stock today per item and warehouse')),
      N('s2', 0, 'ERP.ORDER_LINES', B('bestellte Stückzahl je Artikel und Tag', 'pieces ordered per item and day')),
      N('s3', 0, 'WMS.STOCK_2019', B('alte Inventur aus dem Jahr 2019', 'old stocktake from 2019')),
      N('t1', 1, 'CALC_RANGE', B('teilt den Bestand durch den Verbrauch je Tag', 'divides stock by daily demand')),
      N('t2', 1, 'ARCHIVE_COUNTS', B('legt alte Inventuren ab', 'files old stocktakes')),
      N('w1', 2, 'FACT_STOCK_DAYS', B('Reichweite je Artikel in Tagen', 'days of stock per item')),
      N('w2', 2, 'HIST_INVENTORY', B('Inventuren früherer Jahre', 'stocktakes of earlier years')),
      N('r1', 3, B('Reichweite des Lagers', 'Days of stock')),
      N('r2', 3, B('Liste zum Nachbestellen', 'Reorder list')),
      N('r3', 3, B('Archiv der Inventuren', 'Stocktake archive')),
    ],
    edges: [['s1', 't1'], ['s2', 't1'], ['s3', 't2'], ['t1', 'w1'], ['t2', 'w2'], ['w1', 'r1'], ['w1', 'r2'], ['w2', 'r3']],
    missing: [
      { e: ['w1', 'r1'], need: B('Reichweite je Artikel in Tagen', 'days of stock per item'), k: 'stock day' },
      { e: ['t1', 'w1'], need: B('Bestand geteilt durch Verbrauch', 'stock divided by demand'), k: 'stock demand' },
      { e: ['s1', 't1'], need: B('den Bestand von heute', 'today\'s stock'), k: 'stock' },
      { e: ['s2', 't1'], need: B('die bestellte Stückzahl je Tag', 'the pieces ordered per day'), k: 'order quantity day' },
    ],
    impact: [
      { src: 's2', field: 'QTY', hit: ['r1', 'r2'] },
      { src: 's3', field: 'COUNT_DT', hit: ['r3'] },
      { src: 's1', field: 'QTY', hit: ['r1', 'r2'] },
    ] },
  { id: 'attrition',
    nodes: [
      N('s1', 0, 'HR.EMPLOYEES', B('Mitarbeitende: Eintritt und Abteilung', 'Employees: hire date and department')),
      N('s2', 0, 'HR.EXITS', B('Austritte mit Datum und Grund', 'Exits with date and reason')),
      N('s3', 0, 'ERP.ORDERS', B('Bestellungen mit Betrag', 'Orders with amounts')),
      N('t1', 1, 'CALC_EXIT_SHARE', B('teilt Austritte durch Köpfe, je Abteilung', 'divides exits by headcount, per department')),
      N('t2', 1, 'SUM_ORDERS', B('summiert Bestellwerte je Quartal', 'adds up order values per quarter')),
      N('w1', 2, 'FACT_ATTRITION', B('Fluktuation je Abteilung: Anteil der Austritte', 'staff turnover per department: share of exits')),
      N('w2', 2, 'FACT_TURNOVER_EUR', B('Umsatz in Euro je Quartal', 'revenue in euros per quarter')),
      N('r1', 3, B('Fluktuation im Personal', 'Staff turnover')),
      N('r2', 3, B('Abteilungen im Vergleich', 'Departments compared')),
      N('r3', 3, B('Umsatz je Quartal', 'Revenue per quarter')),
    ],
    edges: [['s1', 't1'], ['s2', 't1'], ['s3', 't2'], ['t1', 'w1'], ['t2', 'w2'], ['w1', 'r1'], ['w1', 'r2'], ['w2', 'r3']],
    missing: [
      { e: ['w1', 'r1'], need: B('den Anteil der Austritte', 'the share of exits'), k: 'turnover' },
      { e: ['t1', 'w1'], need: B('Austritte geteilt durch Köpfe', 'exits divided by headcount'), k: 'exit share' },
      { e: ['s2', 't1'], need: B('die Austritte mit Datum', 'the exits with dates'), k: 'exit date' },
      { e: ['s1', 't1'], need: B('alle Mitarbeitenden je Abteilung', 'all employees per department'), k: 'employee department' },
    ],
    impact: [
      { src: 's2', field: 'EXIT_DT', hit: ['r1', 'r2'] },
      { src: 's3', field: 'AMOUNT', hit: ['r3'] },
      { src: 's1', field: 'DEPT_CD', hit: ['r1', 'r2'] },
    ] },
  { id: 'newsletter',
    nodes: [
      N('s1', 0, 'MAIL.SENDS', B('verschickte Mails je Kampagne', 'mails sent per campaign')),
      N('s2', 0, 'MAIL.EVENTS', B('Öffnungen und Klicks in Mails', 'opens and clicks in mails')),
      N('s3', 0, 'WEB.CLICKS', B('Klicks im Shop, nicht in Mails', 'clicks in the shop, not in mails')),
      N('t1', 1, 'CALC_RATES', B('teilt Öffnungen und Klicks durch verschickte Mails', 'divides opens and clicks by mails sent')),
      N('t2', 1, 'COUNT_SHOP_CLICKS', B('zählt Klicks im Shop je Tag', 'counts shop clicks per day')),
      N('w1', 2, 'FACT_CAMPAIGN', B('Öffnungs- und Klickrate je Kampagne', 'open and click rate per campaign')),
      N('w2', 2, 'FACT_SHOP_CLICKS', B('Klicks im Shop je Tag', 'shop clicks per day')),
      N('r1', 3, B('Erfolg des Newsletters', 'Newsletter results')),
      N('r2', 3, B('Beste Betreffzeilen', 'Best subject lines')),
      N('r3', 3, B('Klicks im Shop', 'Clicks in the shop')),
    ],
    edges: [['s1', 't1'], ['s2', 't1'], ['s3', 't2'], ['t1', 'w1'], ['t2', 'w2'], ['w1', 'r1'], ['w1', 'r2'], ['w2', 'r3']],
    missing: [
      { e: ['w1', 'r1'], need: B('Öffnungs- und Klickrate je Kampagne', 'open and click rate per campaign'), k: 'open click rate campaign' },
      { e: ['t1', 'w1'], need: B('die berechneten Raten', 'the calculated rates'), k: 'rate' },
      { e: ['s1', 't1'], need: B('die verschickten Mails', 'the mails sent'), k: 'mail sent' },
      { e: ['s2', 't1'], need: B('Öffnungen und Klicks in Mails', 'opens and clicks in mails'), k: 'open click' },
    ],
    impact: [
      { src: 's1', field: 'SENT_CNT', hit: ['r1', 'r2'] },
      { src: 's3', field: 'CLICK_TS', hit: ['r3'] },
      { src: 's2', field: 'EVENT_TYPE', hit: ['r1', 'r2'] },
    ] },
  { id: 'leadtime',
    nodes: [
      N('s1', 0, 'ERP.ORDERS', B('Bestellungen mit Bestelltag', 'Orders with the order day')),
      N('s2', 0, 'TMS.DELIVERIES', B('Zustellungen mit Zustelltag', 'Deliveries with the delivery day')),
      N('s3', 0, 'TMS.DELIVERY_COSTS', B('Kosten je Sendung', 'Cost per shipment')),
      N('t1', 1, 'CALC_LEAD_TIME', B('rechnet Zustelltag minus Bestelltag', 'takes delivery day minus order day')),
      N('t2', 1, 'SUM_COSTS', B('summiert Kosten je Paketdienst', 'adds up cost per carrier')),
      N('w1', 2, 'FACT_LEAD_TIME', B('Lieferzeit in Tagen je Bestellung', 'delivery time in days per order')),
      N('w2', 2, 'FACT_DELIVERY_COST', B('Frachtkosten je Paketdienst', 'freight cost per carrier')),
      N('r1', 3, B('Lieferzeit', 'Delivery time')),
      N('r2', 3, B('Pünktliche Lieferungen', 'Deliveries on time')),
      N('r3', 3, B('Frachtkosten', 'Freight costs')),
    ],
    edges: [['s1', 't1'], ['s2', 't1'], ['s3', 't2'], ['t1', 'w1'], ['t2', 'w2'], ['w1', 'r1'], ['w1', 'r2'], ['w2', 'r3']],
    missing: [
      { e: ['w1', 'r1'], need: B('die Lieferzeit in Tagen', 'the delivery time in days'), k: 'delivery' },
      { e: ['t1', 'w1'], need: B('Zustelltag minus Bestelltag', 'delivery day minus order day'), k: 'lead time' },
      { e: ['s2', 't1'], need: B('den Zustelltag je Bestellung', 'the delivery day per order'), k: 'delivery date' },
      { e: ['s1', 't1'], need: B('den Bestelltag', 'the order day'), k: 'order date' },
    ],
    impact: [
      { src: 's2', field: 'DLV_DT', hit: ['r1', 'r2'] },
      { src: 's3', field: 'COST_EUR', hit: ['r3'] },
      { src: 's1', field: 'ORDER_DT', hit: ['r1', 'r2'] },
    ] },
];

// ---------- drawing a round ----------

export const shuffle = (a, rnd = Math.random) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};

/** Prefers items whose id was not in the last round (seen), in random order. */
function fresh(list, seen, rnd) {
  const s = shuffle(list, rnd);
  return [...s.filter((x) => !seen.has(x.id)), ...s.filter((x) => seen.has(x.id))];
}

/** One odd-one-out row for play: shuffled tiles (relaxed: three of them), the index of the odd one. */
export function oddRow(row, easy = false, rnd = Math.random) {
  let tiles = row.tiles.map((tl, i) => ({ ...tl, odd: i === row.odd, i }));
  if (easy) { const drop = tiles.filter((tl) => !tl.odd).pop(); tiles = tiles.filter((tl) => tl !== drop); }
  tiles = shuffle(tiles, rnd);
  return { id: row.id, lvl: row.lvl, show: row.show, key: row.key ?? null, why: row.why, tiles, odd: tiles.findIndex((tl) => tl.odd) };
}

/** One connect board: descriptions (askers) on the left, fields on the right, the assistant's proposals. */
export function makeBoard(theme, { pairs = 4, decoy = false, rnd = Math.random } = {}) {
  const must = theme.pairs.filter((p) => p.must);
  const rest = shuffle(theme.pairs.filter((p) => !p.must), rnd);
  const chosen = shuffle([...must, ...rest].slice(0, pairs), rnd);
  const fieldIds = shuffle([...chosen.map((p) => p.f), ...(decoy && theme.decoy ? [theme.decoy] : [])], rnd);
  const fields = fieldIds.map((id) => ({ id, ...theme.fields[id] }));
  const cands = fields.map((f) => ({ id: f.id, name: f.n }));
  const asks = chosen.map((p, i) => ({ id: `d${i}`, d: p.d, f: p.f, ai: propose(p.k, cands) }));
  return { id: theme.id, asks, fields };
}

/** One lineage graph for play: which links are missing (relaxed: three), the proposals, one impact question. */
export function makeGraph(g, { missing = 4, rnd = Math.random } = {}) {
  const miss = g.missing.slice(0, missing).map((m) => {
    const [from, to] = m.e;
    const col = g.nodes.find((n) => n.id === from).col;
    const cands = g.nodes.filter((n) => n.col === col).map((n) => ({ id: n.id, name: n.n }));
    return { from, to, need: m.need, ai: propose(m.k, cands) };
  });
  const impact = g.impact[Math.floor(rnd() * g.impact.length)];
  return { id: g.id, nodes: g.nodes, edges: g.edges, missing: miss, impact };
}

/**
 * A round: 6 rows (two of each level, different kinds), 3 boards (the last with a field too
 * many), 2 graphs. Relaxed: 5 rows of three tiles, boards of three pairs, graphs with three
 * missing links. seen: ids of the last round, so the next one brings other content.
 */
export function drawRound({ easy = false, seen = new Set(), rnd = Math.random } = {}) {
  const rows = [];
  for (const lvl of [1, 2, 3]) {
    const cats = new Set();
    let n = 0;
    for (const r of fresh(ODD.filter((x) => x.lvl === lvl), seen, rnd)) {
      if (cats.has(r.cat) || n >= (easy && lvl === 3 ? 1 : 2)) continue;
      cats.add(r.cat);
      rows.push(oddRow(r, easy, rnd));
      n += 1;
    }
  }
  const themes = fresh(THEMES, seen, rnd).slice(0, 3);
  const boards = themes.map((th, i) => makeBoard(th, { pairs: easy ? 3 : 4, decoy: i === 2, rnd }));
  const graphs = fresh(GRAPHS, seen, rnd).slice(0, 2).map((g) => makeGraph(g, { missing: easy ? 3 : 4, rnd }));
  return { rows, boards, graphs, ids: [...rows.map((r) => r.id), ...boards.map((b) => b.id), ...graphs.map((g) => g.id)] };
}
