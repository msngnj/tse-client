(function () {
const isNode    = (function(){return typeof global!=='undefined'&&this===global})();
const isBrowser = (function(){return typeof window!=='undefined'&&this===window})();
const fetch   = isNode ? require('node-fetch') : isBrowser ? window.fetch   : undefined;
const Big     = isNode ? require('big.js')     : isBrowser ? window.Big     : undefined;
const jalaali = isNode ? require('jalaali-js') : isBrowser ? window.jalaali : undefined;
if (isBrowser) {
  if (!Big)         throw new Error('Cannot find required dependecy: Big');
  if (!localforage) throw new Error('Cannot find required dependecy: localforage');
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// storage
const storage = (function () {
  let instance;
  
  if (isNode) {
    const { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } = require('fs');
    const { join } = require('path');
    const { gzipSync, gunzipSync } = require('zlib');
    
    let datadir;
    const home = require('os').homedir();
    const defaultdir = join(home, 'tse-cache');
    const pathfile   = join(home, '.tse');
    if ( existsSync(pathfile) ) {
      datadir = readFileSync(pathfile, 'utf8');
      try { statSync(datadir).isDirectory(); } catch { datadir = defaultdir; }
    } else {
      datadir = defaultdir;
      if ( !existsSync(datadir) ) mkdirSync(datadir);
      writeFileSync(pathfile, datadir);
    }
    
    const store = Object.create(null);
    
    const getItem = (key) => {
      key = key.replace('tse.', '');
      const file = join(datadir, `${key}.csv`);
      if ( !existsSync(file) ) writeFileSync(file, '');
      if ( !(key in store) ) store[key] = readFileSync(file, 'utf8');
      return store[key];
    };
    
    const setItem = (key, value) => {
      key = key.replace('tse.', '');
      store[key] = value;
      writeFileSync(join(datadir, `${key}.csv`), value);
    };
    
    const getItemAsync = (key, zip=false) => new Promise((done, fail) => {
      key = key.replace('tse.', '');
      const file = join(datadir, `${key}.csv` + (zip?'.gz':''));
      if ( !existsSync(file) ) { done(''); return; };
      if ( !(key in store) ) {
        const content = readFileSync(file, zip?undefined:'utf8');
        store[key] = zip ? gunzipSync(content).toString() : content;
      }
      done(store[key]);
    });
    
    const setItemAsync = (key, value, zip=false) => new Promise((done, fail) => {
      key = key.replace('tse.', '');
      store[key] = value;
      const file = join(datadir, `${key}.csv` + (zip?'.gz':''));
      writeFileSync(file, zip ? gzipSync(value) : value);
      done();
    });
    
    instance = {
      getItem, setItem, getItemAsync, setItemAsync,
      get CACHE_DIR() { return datadir.replace(/\\/g,'/'); },
      set CACHE_DIR(newdir) {
        if (typeof newdir === 'string') {
          if ( !existsSync(newdir) ) mkdirSync(newdir);
          if ( statSync(newdir).isDirectory() ) {
            datadir = newdir;
            writeFileSync(pathfile, datadir);
          }
        }
      }
    };
  } else if (isBrowser) {
    const pako = window.pako || undefined;
    
    const getItemAsync = async (key, zip=false) => {
      const stored = await localforage.getItem(key);
      if (!stored || !pako) return stored;
      return zip ? pako.ungzip(stored, {to: 'string'}) : stored;
    };
    
    const setItemAsync = async (key, value, zip=false) => {
      if (!pako) {
        await localforage.setItem(key, value);
        return;
      }
      const rdy = zip ? pako.gzip(value) : value;
      await localforage.setItem(key, rdy);
    };
    
    instance = {
      getItem: (key)        => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      getItemAsync,
      setItemAsync
    };
  }
  
  return instance;
})();
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// request
let API_URL = 'http://service.tsetmc.com/tsev2/data/TseClient2.aspx';
const rq = {
  Instrument(DEven) {
    const params = {
      t: 'Instrument',
      a: ''+DEven
    };
    return this.makeRequest(params);
  },
  InstrumentAndShare(DEven, LastID=0) {
    const params = {
      t: 'InstrumentAndShare',
      a: ''+DEven,
      a2: ''+LastID
    };
    return this.makeRequest(params);
  },
  LastPossibleDeven() {
    const params = {
      t: 'LastPossibleDeven'
    };
    return this.makeRequest(params);
  },
  ClosingPrices(insCodes) {
    const params = {
      t: 'ClosingPrices',
      a: ''+insCodes
    };
    return this.makeRequest(params);
  },
  makeRequest(params) {
    const url = new URL(API_URL);
    url.search = new URLSearchParams(params).toString();
    
    return new Promise((resolve, reject) => {
      fetch(url).then(async res => {
        res.status === 200 ? resolve(await res.text()) : reject(res.status +' '+ res.statusText);
      }).catch(err => reject(err));
    });
  }
};
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// structs
class ClosingPrice {
  constructor(_row='') {
    const row = _row.split(',');
    if (row.length !== 11) throw new Error('Invalid ClosingPrice data!');
    this.InsCode        = row[0];  // int64
    this.DEven          = row[1];  // int32 (the rest are all decimal)
    this.PClosing       = row[2];  // close
    this.PDrCotVal      = row[3];  // last
    this.ZTotTran       = row[4];  // count
    this.QTotTran5J     = row[5];  // volume
    this.QTotCap        = row[6];  // price
    this.PriceMin       = row[7];  // low
    this.PriceMax       = row[8];  // high
    this.PriceYesterday = row[9];  // yesterday
    this.PriceFirst     = row[10]; // open
  }
}
const cols  = ['CompanyCode', 'LatinName', 'Symbol', 'Name', 'Date', 'ShamsiDate', 'PriceFirst', 'PriceMax', 'PriceMin', 'LastPrice', 'ClosingPrice', 'Price', 'Volume', 'Count', 'PriceYesterday'];
const colsFa = ['کد شرکت', 'نام لاتین', 'نماد', 'نام', 'تاریخ میلادی', 'تاریخ شمسی', 'اولین قیمت', 'بیشترین قیمت', 'کمترین قیمت', 'آخرین قیمت', 'قیمت پایانی', 'ارزش', 'حجم', 'تعداد معاملات', 'قیمت دیروز'];
class Column {
  constructor(row=[]) { 
    const len = row.length;
    if (len > 2 || len < 1) throw new Error('Invalid Column data!');
    this.name   = cols[ row[0] ];
    this.fname  = colsFa[ row[0] ];
    this.header = row[1];
  }
}
class Instrument {
  constructor(_row='') {
    const row = _row.split(',');
    if (row.length !== 18) throw new Error('Invalid Instrument data!');
    // unspecified ones are all string
    this.InsCode      = row[0];         // int64 (long)
    this.InstrumentID = row[1];
    this.LatinSymbol  = row[2];
    this.LatinName    = row[3];
    this.CompanyCode  = row[4];
    this.Symbol       = cleanFa(row[5]);
    this.Name         = row[6];
    this.CIsin        = row[7];
    this.DEven        = row[8];         // int32 (int)
    this.Flow         = row[9];         // 0,1,2,3,4,5,6,7 بازار byte
    this.LSoc30       = row[10];        // نام 30 رقمي فارسي شرکت
    this.CGdSVal      = row[11];        // A,I,O نوع نماد
    this.CGrValCot    = row[12];        // 00,11,1A,...25 کد گروه نماد
    this.YMarNSC      = row[13];        // NO,OL,BK,BY,ID,UI کد بازار
    this.CComVal      = row[14];        // 1,3,4,5,6,7,8,9 کد تابلو
    this.CSecVal      = row[15].trim(); // []62 کد گروه صنعت
    this.CSoSecVal    = row[16].trim(); // []177 کد زير گروه صنعت
    this.YVal         = row[17];        // string نوع نماد
  }
}
class Share {
  constructor(_row='') {
    const row = _row.split(',');
    if (row.length !== 5) throw new Error('Invalid Share data!');
    this.Idn              = row[0];      // long
    this.InsCode          = row[1];      // long
    this.DEven            = row[2];      // int
    this.NumberOfShareNew = parseInt( row[3] ); // Decimal
    this.NumberOfShareOld = parseInt( row[4] ); // Decimal
  }
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// utils
function parseInstruments(struct=false, arr=false, structKey='InsCode') {
  const rows = storage.getItem('tse.instruments').split(';');
  const instruments = arr ? [] : {};
  for (const row of rows) {
    const item = struct ? new Instrument(row) : row;
    if (arr) {
      instruments.push(item);
    } else {
      const key = struct ? item[structKey] : row.split(',', 1)[0];
      instruments[key] = item;
    }
  }
  return instruments;
}
function parseShares(struct=false, arr=false, structKey='InsCode') {
  const rows = storage.getItem('tse.shares').split(';');
  const shares = arr ? [] : {};
  for (const row of rows) {
    const item = struct ? new Share(row) : row;
    if (arr) {
      shares.push(item);
    } else {
      const key = struct ? item[structKey] : row.split(',', 2)[1];
      shares[key] = item;
    }
  }
  return shares;
}
function dateToStr(d) {
  return (d.getFullYear()*10000) + ( (d.getMonth()+1)*100 ) + d.getDate() + '';
}
function strToDate(s) {
  return new Date( +s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8) );
}
function cleanFa(str) {
  return str
    // .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\u200B/g, '')        // zero-width space
    .replace(/\s?\u200C\s?/g, ' ') // zero-width non-joiner
    .replace(/\u200D/g, '')        // zero-width joiner
    .replace(/\uFEFF/g, '')        // zero-width no-break space
    .replace(/ك/g,'ک')
    .replace(/ي/g,'ی');
}
function gregToShamsi(s) {
  const { jy, jm, jd } = jalaali.toJalaali(+s.slice(0,4), +s.slice(4,6), +s.slice(6,8));
  return (jy*10000) + (jm*100) + jd + '';
}
function shamsiToGreg(s) {
  const { gy, gm, gd } = jalaali.toGregorian(+s.slice(0,4), +s.slice(4,6), +s.slice(6,8));
  return (gy*10000) + (gm*100) + gd + '';
}
function dayDiff(s1, s2) {
  const date1 = +new Date(+s1.slice(0,4), +s1.slice(4,6)-1, +s1.slice(6,8));
  const date2 = +new Date(+s2.slice(0,4), +s2.slice(4,6)-1, +s2.slice(6,8));
  const diffTime = Math.abs(date2 - date1);
  const msPerDay = (1000 * 60 * 60 * 24);
  const diffDays = Math.ceil(diffTime / msPerDay);
  return diffDays;
}
function splitArr(arr, size){
  return arr
    .map( (v, i) => i % size === 0 ? arr.slice(i, i+size) : undefined )
    .filter(i => i);
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// price helpers
Big.DP = 40; // max decimal places
Big.RM = 2;  // rounding mode: http://mikemcl.github.io/big.js/#rm
function adjust(cond, closingPrices, shares, insCode) {
  const cp = closingPrices;
  const len = closingPrices.length;
  const res = [];
  if ( (cond === 1 || cond === 2) && len > 1 ) {
    let gaps = new Big('0.0');
    let num = new Big('1.0');
    res.push( cp[len-1] );
    if (cond === 1) {
      for (let i=len-2; i>=0; i-=1) {
        if ( !Big(cp[i].PClosing).eq(cp[i+1].PriceYesterday) ) {
          gaps = gaps.plus(1);
        }
      }
    }
    if ( (cond === 1 && gaps.div(len).lt('0.08')) || cond === 2 ) {
      for (let i=len-2; i>=0; i-=1) {
        const curr = cp[i];
        const next = cp[i+1];
        const pricesDontMatch = !Big(curr.PClosing).eq(next.PriceYesterday);
        const targetShare = shares.find(share => share.InsCode === insCode && share.DEven === next.DEven);
        
        if (cond === 1 && pricesDontMatch) {
          num = num.times(next.PriceYesterday).div(curr.PClosing);
        } else if (cond === 2 && pricesDontMatch && targetShare) {
          const oldShares = targetShare.NumberOfShareOld;
          const newShares = targetShare.NumberOfShareNew;
          num = num.times(oldShares).div(newShares);
        }
        
        let
        close = num.times(curr.PClosing).round(2).toFixed(2),
        last  = num.times(curr.PDrCotVal).round(2).toFixed(2),
        low   = num.times(curr.PriceMin).round().toString(),
        high  = num.times(curr.PriceMax).round().toString(),
        yday  = num.times(curr.PriceYesterday).round().toString(),
        first = num.times(curr.PriceFirst).round(2).toFixed(2);
        
        const adjustedClosingPrice = {
          InsCode:        curr.InsCode,
          DEven:          curr.DEven,
          PClosing:       close,           // close
          PDrCotVal:      last,            // last
          ZTotTran:       curr.ZTotTran,
          QTotTran5J:     curr.QTotTran5J,
          QTotCap:        curr.QTotCap,
          PriceMin:       low,             // low
          PriceMax:       high,            // high
          PriceYesterday: yday,            // yesterday
          PriceFirst:     first            // first
        };
        
        res.push(adjustedClosingPrice);
      }
    }
  }
  return res.reverse();
  // return res;
}
function getCell(columnName, instrument, closingPrice) {
  const c = columnName;
  const str =
    c === 'CompanyCode'    ? instrument.CompanyCode :
    c === 'LatinName'      ? instrument.LatinName :
    c === 'Symbol'         ? instrument.Symbol.replace(' ', '_') :
    c === 'Name'           ? instrument.Name.replace(' ', '_') :
    c === 'Date'           ? closingPrice.DEven :
    c === 'ShamsiDate'     ? jalaali && gregToShamsi(closingPrice.DEven) :
    c === 'PriceFirst'     ? closingPrice.PriceFirst :
    c === 'PriceMax'       ? closingPrice.PriceMax :
    c === 'PriceMin'       ? closingPrice.PriceMin :
    c === 'LastPrice'      ? closingPrice.PDrCotVal :
    c === 'ClosingPrice'   ? closingPrice.PClosing :
    c === 'Price'          ? closingPrice.QTotCap:
    c === 'Volume'         ? closingPrice.QTotTran5J :
    c === 'Count'          ? closingPrice.ZTotTran :
    c === 'PriceYesterday' ? closingPrice.PriceYesterday : '';
  
  return str;
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
let UPDATE_INTERVAL           = 1;
let PRICES_UPDATE_CHUNK       = isBrowser ? 10  : 50;
let PRICES_UPDATE_CHUNK_DELAY = isBrowser ? 500 : 3000;
let PRICES_UPDATE_RETRY_COUNT = 3;
let PRICES_UPDATE_RETRY_DELAY = 5000;
const defaultSettings = {
  columns: [
    [4, 'date'],
    [6, 'open'],
    [7, 'high'],
    [8, 'low'],
    [9, 'last'],
    [10, 'close'],
    [12, 'vol']
  ],
  adjustPrices: 0,
  daysWithoutTrade: false,
  startDate: '20010321'
};
const { warn } = console;

let storedPrices;

async function parseStoredPrices() {
  if (storedPrices) return storedPrices;
  storedPrices = {};
  
  const storedStr = await storage.getItemAsync('tse.prices', true);
  if (!storedStr) return storedPrices;
  
  const strs = storedStr.split('@');
  for (let i=0, n=strs.length; i<n; i++) {
    const str = strs[i];
    if (!str) continue;
    storedPrices[ str.split(',',1)[0] ] = str;
  }
}

function shouldUpdate(latest='') {
  if (!latest || latest === '0') return true; // first time (never updated before)
  
  const today = new Date();
  const daysPassed = dayDiff(dateToStr(today), latest);
  const inWeekend = [4,5].includes( today.getDay() );
  const lastUpdateWeekday = strToDate(latest).getDay();
  
  const result = (
    daysPassed >= UPDATE_INTERVAL &&
    today.getHours() > 16 &&     // w8 until end of trading session
    !(
      // no update needed if: we are in weekend but ONLY if last time we updated was on last day (wednesday) of THIS week
      inWeekend &&
      lastUpdateWeekday !== 3 && // not wednesday
      daysPassed <= 3            // and wednesday of this week
    )
  );
  
  return result; 
}

async function getLastPossibleDeven() {
  let lastPossibleDeven = storage.getItem('tse.lastPossibleDeven');
  
  if ( shouldUpdate(lastPossibleDeven) ) {
    let error;
    const res = await rq.LastPossibleDeven().catch(err => error = err);
    if (error)                        return { title: 'Failed request: LastPossibleDeven', detail: error };
    if ( !/^\d{8};\d{8}$/.test(res) ) return { title: 'Invalid server response: LastPossibleDeven' };
    lastPossibleDeven = res.split(';')[0] || res.split(';')[1];
    storage.setItem('tse.lastPossibleDeven', lastPossibleDeven);
  }
  
  return +lastPossibleDeven;
}

async function updateInstruments() {
  const lastUpdate = storage.getItem('tse.lastInstrumentUpdate');
  let lastDeven;
  let lastId;
  let currentInstruments;
  let currentShares;
  
  if (!lastUpdate) {
    lastDeven = 0;
    lastId = 0;
  } else {
    currentInstruments = parseInstruments();
    currentShares      = parseShares();
    const insDevens = Object.keys(currentInstruments).map( k => +currentInstruments[k].split(',',9)[8] );
    const shareIds  = Object.keys(currentShares).map( k => +currentShares[k].split(',',1)[0] );
    lastDeven = Math.max(...insDevens);
    lastId    = Math.max(...shareIds);
  }
  
  if ( !shouldUpdate(''+lastDeven) ) return;
  
  let error;
  const res = await rq.InstrumentAndShare(lastDeven, lastId).catch(err => error = err);
  if (error) return { title: 'Failed request: InstrumentAndShare', detail: error };
  
  const splitted  = res.split('@');
  let instruments = splitted[0];
  let shares      = splitted[1];
  
  // if (instruments === '*') warn('Cannot update during trading session hours.');
  // if (instruments === '')  warn('Already updated: ', 'Instruments');
  // if (shares === '')       warn('Already updated: ', 'Shares');
  
  if (instruments !== '' && instruments !== '*') {
    if (currentInstruments && Object.keys(currentInstruments).length) {
      instruments.split(';').forEach(i => currentInstruments[ i.split(',',1)[0] ] = i);
      instruments = Object.keys(currentInstruments).map(k => currentInstruments[k]).join(';');
    }
    storage.setItem('tse.instruments', instruments);
  }
  
  if (shares !== '') {
    if (currentShares && Object.keys(currentShares).length) {
      shares.split(';').forEach(i => currentShares[ i.split(',',1)[0] ] = i);
      shares = Object.keys(currentShares).map(k => currentShares[k]).join(';');
    }
    storage.setItem('tse.shares', shares);
  }
  
  if ((instruments !== '' && instruments !== '*') || shares !== '') {
    storage.setItem('tse.lastInstrumentUpdate', dateToStr(new Date()));
  }
}

const updatePricesManager = (function () {
  let total = 0;
  let succs = [];
  let fails = [];
  let retries = 0;
  let retrychunks = [];
  let timeouts = new Map();
  let qeudRetry;
  let resolve;
  
  function poll() {
    if (timeouts.size > 0 || qeudRetry) {
      setTimeout(poll, 500);
      return;
    }
    
    if (succs.length === total || retries >= PRICES_UPDATE_RETRY_COUNT) {
      resolve( {succs, fails} );
      return;
    }
    
    if (retrychunks.length) {
      const inscodes = retrychunks.flat().map(i => i[0]);
      fails = fails.filter(i => inscodes.indexOf(i) === -1);
      retries++;
      qeudRetry = setTimeout(batch, PRICES_UPDATE_RETRY_DELAY, retrychunks);
      retrychunks = [];
      setTimeout(poll, PRICES_UPDATE_RETRY_DELAY);
    }
  }
  
  function onresult(response, chunk, id) {
    const inscodes = chunk.map(([insCode]) => insCode);
    
    if ( typeof response === 'string' && /^[\d.,;@-]+$/.test(response) ) {
      const succ = response.split('@').map((v,i)=> [chunk[i][0], v]);
      succs.push(...succ);
      fails = fails.filter(i => inscodes.indexOf(i) === -1);
    } else {
      fails.push(...inscodes);
      retrychunks.push(chunk);
    }
    
    timeouts.delete(id);
  }
  
  function request(chunk=[], id) {
    const insCodes = chunk.map(i => i.join(',')).join(';');
    
    rq.ClosingPrices(insCodes)
      .then( r => onresult(r, chunk, id) )
      .catch( () => onresult(undefined, chunk, id) );
  }
  
  function batch(chunks=[]) {
    if (qeudRetry) qeudRetry = undefined;
    const ids = chunks.map((v,i) => 'a'+i);
    for (let i=0, delay=0, n=chunks.length; i<n; i++, delay+=PRICES_UPDATE_CHUNK_DELAY) {
      const id = ids[i];
      const t = setTimeout(request, delay, chunks[i], id);
      timeouts.set(id, t);
    }
  }
  
  function start(updateNeeded=[]) {
    total = updateNeeded.length;
    succs = [];
    fails = [];
    retries = 0;
    retrychunks = [];
    timeouts = new Map();
    qeudRetry = undefined;
    
    const chunks = splitArr(updateNeeded, PRICES_UPDATE_CHUNK);
    
    batch(chunks);
    
    poll();
    
    return new Promise(r => resolve = r);
  }
  
  return start;
})();
async function updatePrices(instruments=[]) {
  if (!instruments.length) return;
  const result = { succs: {}, fails: {}, error: undefined };
  
  const lastPossibleDeven = await getLastPossibleDeven();
  if (typeof lastPossibleDeven !== 'number') {
    result.error = lastPossibleDeven;
    return result;
  }
  
  const updateNeeded = [];
  const oldContents = {};
  for (const instrument of instruments) {
    const insCode = instrument.InsCode;
    const market = instrument.YMarNSC === 'NO' ? 0 : 1;
    const insData = storedPrices[insCode];
    
    if (!insData) { // doesn't have data
      const firstPossibleDeven = defaultSettings.startDate;
      updateNeeded.push( [insCode, firstPossibleDeven, market] );
    } else { // has data
      const rows = insData.split(';');
      const lastDeven  =  new ClosingPrice( rows[rows.length-1] ).DEven;
      
      if ( shouldUpdate(lastDeven) ) { // but outdated
        updateNeeded.push( [insCode, lastDeven, market] );
        oldContents[insCode] = insData;
      }
    }
  }
  if (!Object.keys(updateNeeded).length) return result;
  
  const { succs, fails } = await updatePricesManager(updateNeeded);
  
  for (const [insCode, newContent] of succs) {
    const oldContent = oldContents[insCode];
    
    let content = oldContent || '';
    if (newContent) {
      content = oldContent ? oldContent+';'+newContent : newContent;
    }
    
    storedPrices[insCode] = content;
  }
  
  let str = '';
  const keys = Object.keys(storedPrices);
  for (let i=0, n=keys.length; i<n; i++) str += storedPrices[ keys[i] ] + '@';
  str = str.slice(0, -1);
  
  await storage.setItemAsync('tse.prices', str, true);
  
  return {
    ...result,
    succs: succs.map(([insCode]) => insCode),
    fails
  };
}

async function getPrices(symbols=[], _settings={}) {
  if (!symbols.length) return;
  const result = { data: [], error: undefined };
  
  const err = await updateInstruments();
  if (err) {
    const { title, detail } = err;
    result.error = { code: 1, title, detail };
    return result;
  }
  
  const instruments = parseInstruments(true, undefined, 'Symbol');
  const selection = symbols.map(i => instruments[i]);
  const notFounds = symbols.filter((v,i) => !selection[i]);
  if (notFounds.length) {
    result.error = { code: 2, title: 'Incorrect Symbol', symbols: notFounds };
    return result;
  }
  
  await parseStoredPrices();
  
  const { succs, fails, error } = await updatePrices(selection);
  if (error) {
    const { title, detail } = error;
    result.error = { code: 1, title, detail };
    return result;
  }
  
  if (fails.length) {
    const _selection = selection.reduce((a, {InsCode,Symbol}) => (a[InsCode] = Symbol, a), {});
    result.error = { code: 3, title: 'Incomplete Price Update',
      fails: fails.map(k => _selection[k]),
      succs: succs.map(k => _selection[k])
    };
    selection.forEach((v,i,a) => fails.includes(v.InsCode) ? a[i] = undefined : 0);
  }
  
  const prices = {};
  for (const i of selection) {
    if (!i) continue;
    const insCode = i.InsCode;
    const strPrices = storedPrices[insCode];
    if (!strPrices) continue; // throw new Error('Unkown Error');
    prices[insCode] = strPrices.split(';').map(i => new ClosingPrice(i));
  }
  
  const settings = {...defaultSettings, ..._settings};
  
  const columns = settings.columns.map(i => {
    const row = !Array.isArray(i) ? [i] : i;
    const column = new Column(row);
    const finalHeader = column.header || column.name;
    return { ...column, header: finalHeader };
  });
  
  const { adjustPrices, startDate, daysWithoutTrade } = settings;
  const shares = parseShares(true, true);
  
  result.data = selection.map(instrument => {
    if (!instrument) return;
    const res = {};
    columns.forEach(col => res[col.header] = []);
    
    const insCode = instrument.InsCode;
    if (!prices[insCode]) return res;
    const cond = adjustPrices;
    const closingPrices = cond === 1 || cond === 2
      ? adjust(cond, prices[insCode], shares, insCode)
      : prices[insCode];
    
    for (const closingPrice of closingPrices) {
      if ( Big(closingPrice.DEven).lte(startDate) ) continue;
      if ( Big(closingPrice.ZTotTran).eq(0) && !daysWithoutTrade ) continue;
      
      for (const {header, name} of columns) {
        const cell = getCell(name, instrument, closingPrice);
        res[header].push(/^\d+(\.?\d+)?$/.test(cell) ? parseFloat(cell) : cell);
      }
    }
    
    return res;
  });
  
  return result;
}

async function getInstruments(struct=true, arr=true, structKey='InsCode') {
  const valids = Object.keys(new Instrument([...Array(18).keys()].join(',')));
  if (valids.indexOf(structKey) === -1) structKey = 'InsCode';
  
  const lastUpdate = storage.getItem('tse.lastInstrumentUpdate');
  const err = await updateInstruments();
  if (err && !lastUpdate) return;
  
  return parseInstruments(struct, arr, structKey);
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
let INTRADAY_UPDATE_CHUNK_DELAY = 100;
let INTRADAY_UPDATE_RETRY_COUNT = 7;
let INTRADAY_UPDATE_RETRY_DELAY = 1000;
const itdDefaultSettings = {
  startDate: '20010321',
  endDate: '',
  gzip: true,
  onprogress: undefined
};
const itdGroupCols = [
  [ 'prices',  ['time','last','close','open','high','low','count','volume','value','discarded'] ],
  [ 'orders',  ['time','row','askcount','askvol','askprice','bidprice','bidvol','bidcount'] ],
  [ 'trades',  ['time','count','volume','price','discarded'] ],
  [ 'client', [
      'pbvol','pbcount','pbval','pbprice','pbvolpot',
      'psvol','pscount','psval','psprice','psvolpot',
      'lbvol','lbcount','lbval','lbprice','lbvolpot',
      'lsvol','lscount','lsval','lsprice','lsvolpot', 'plchg']
  ],
  [ 'misc',  ['state','daymin','daymax'] ]
];

let stored = {};

let zip;
let unzip;
if (isNode) {
  const { gzipSync, gunzipSync } = require('zlib');
  zip   = str => gzipSync(str);
  unzip = buf => gunzipSync(buf).toString();
} else if (isBrowser) {
  const { gzip, ungzip } = pako || {};
  zip   = str => gzip(str);
  unzip = buf => ungzip(buf, {to: 'string'});
}

const itdstore = (function () {
  let setItem;
  let getItems;
  
  if (isNode) {
    const { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
    const { join } = require('path');
    
    getItems = async function (selins=new Set()) {
      const d = storage.CACHE_DIR;
      const dirs = readdirSync(d).filter( i => statSync(join(d,i)).isDirectory() && selins.has(i) );
      const result = dirs.map(i => {
        const files = readdirSync(join(d,i)).map(j => [ j.slice(0,-3), readFileSync(join(d,i,j)) ])
        return [ i, Object.fromEntries(files) ];
      }).filter(i=>i);
      return Object.fromEntries(result);
    };
    
    setItem = async function (key, obj) {
      key = key.replace('tse.', '');
      const d = storage.CACHE_DIR;
      const dir = join(d, key);
      if ( !existsSync(dir) ) mkdirSync(dir);
      Object.keys(obj).forEach(k => {
        writeFileSync(join(dir, k+'.gz'), obj[k]);
      });
    };
    
  } else if (isBrowser) {
    
    getItems = async function	(selins=new Set()) {
      const result = {};
      await localforage.iterate((val, key) => {
        let k = key.replace('tse.', '');
        if (selins.has(k)) result[k] = val;
      });
      return result;
    };
    
    setItem = storage.setItemAsync;
    
  }
  
  return { getItems, setItem };
})();

function objify(map, r={}) {
  for (let [k,v] of map) {
    if (Map.prototype.toString.call(v) === '[object Map]' || Array.isArray(v)) {
      r[k] = objify(v, r[k]);
    } else {
      r[k] = v;
    }
  }
  return r;
}
function parseRaw(separator, text) {
  let str = text.split(separator)[1].split('];',1)[0];
  str = '['+ str.replace(/'/g, '"') +']';
  let arr = JSON.parse(str);
  return arr;
}

async function extractAndStore(inscode='', deven_text=[]) {
  if (!stored[inscode]) stored[inscode] = {};
  let storedInstrument = stored[inscode];
  
  for (let [deven, text] of deven_text) {
    if (text === 'N/A') {
      storedInstrument[deven] = text;
      continue;
    }
    let ClosingPrice    = parseRaw('var ClosingPriceData=[', text);
    let BestLimit       = parseRaw('var BestLimitData=[', text);
    let IntraTrade      = parseRaw('var IntraTradeData=[', text);
    let ClientType      = parseRaw('var ClientTypeData=[', text);
    let InstrumentState = parseRaw('var InstrumentStateData=[', text);
    let StaticTreshhold = parseRaw('var StaticTreshholdData=[', text);
    // let ShareHolder     = parseRaw('var ShareHolderData=[', text);
    // let ShareHolderYesterday = parseRaw('var ShareHolderDataYesterday=[', text);
    
    let coli;
    
    coli = [12,2,3,4,6,7,8,9,10,11];
    let price = ClosingPrice.map(row => coli.map(i=> row[i]).join(',') ).join(';');
    
    coli = [0,1,2,3,4,5,6,7];
    let order = BestLimit.map(row => coli.map(i=> row[i]).join(',') ).join(';');
    
    coli = [1,0,2,3,4];
    let trade = IntraTrade.map(row => {
      let [h,m,s] = row[1].split(':');
      let timeint = (+h*10000) + (+m*100) + (+s) + '';
      row[1] = timeint;
      return coli.map(i => row[i]).join(',');
    }).join(';');
    
    coli = [4,0,12,16,8,6,2,14,18,10,5,1,13,17,9,7,3,15,19,11,20];
    let client = coli.map(i=> ClientType[i]).join(',');
    
    let [a, b] = [InstrumentState, StaticTreshhold];
    let state = a.length && a[0].length && a[0][2].trim();
    let daymin, daymax;
    if (b.length && b[1].length) { daymin = b[1][2]; daymax = b[1][1]; }
    let misc = [state, daymin, daymax].join(',');
    
    
    let file = [price, order, trade, client, misc].join('@');
    storedInstrument[deven] = zip(file);
  }
  
  return itdstore.setItem('tse.'+inscode, storedInstrument);
}
const itdUpdateManager = (function () {
  let src = {};
  let total = 0;
  let succs = [];
  let fails = [];
  let retries = 0;
  let retrychunks = [];
  let timeouts = new Map();
  let qeudRetry = -1;
  let resolve;
  let nextsrv = n => n<7 ? ++n : 0;
  let writing = [];
  let pf;
  let pn = 4;
  
  function poll() {
    if (timeouts.size > 0 || qeudRetry) {
      setTimeout(poll, 500);
      return;
    }
    
    if (succs.length === total || retries >= INTRADAY_UPDATE_RETRY_COUNT) {
      let _succs = [ ...succs ];
      let _fails = [ ...fails.map(i => i.slice(1)) ];
      succs = [];
      fails = [];
      src = {};
      
      Promise.all(writing).then(() => {
        writing = [];
        resolve({succs: _succs, fails: _fails});
      });
      return;
    }
    
    if (retrychunks.length) {
      let joined = retrychunks.map(i => i.join(''));
      fails = fails.filter(i => joined.indexOf(i.join('')) === -1);
      retries++;
      retrychunks.forEach(chunk => chunk[0] = nextsrv(chunk[0]));
      qeudRetry = setTimeout(batch, INTRADAY_UPDATE_RETRY_DELAY, retrychunks, true);
      retrychunks = [];
      setTimeout(poll, INTRADAY_UPDATE_RETRY_DELAY);
    }
  }
  
  function onresult(text, chunk, id) {
    if (typeof text === 'string') {
      let res = text === 'N/A' ? text : 'var StaticTreshholdData' + text.split('var StaticTreshholdData')[1];
      let _chunk = chunk.slice(1);
      succs.push(_chunk);
      let [inscode, deven] = _chunk;
      let devens = src[inscode];
      devens[deven] = res;
      
      let alldone = !Object.keys(devens).find(k => !devens[k]);
      if (alldone) {
        let deven_text = Object.keys(devens).map(k => [k, devens[k]]);
        writing.push( extractAndStore(inscode, deven_text) );
      }
      
      fails = fails.filter(i => i.join() !== chunk.join());
      if (pf) pf(pn+=96/total/2);
    } else {
      fails.push(chunk);
      retrychunks.push(chunk);
    }
    
    timeouts.delete(id);
  }
  
  async function request(chunk=[], id) {
    let [server, inscode, deven] = chunk;
    
    fetch('http://cdn'+(server?server:'')+'.tsetmc.com/Loader.aspx?ParTree=15131P&i='+inscode+'&d='+deven)
      .then(async res => {
        let { status } = res;
        
        if (status === 200) {
          let text = await res.text();
          if (text.includes('Object moved to <a href="/GeneralError.aspx?aspxerrorpath=/Loader.aspx">here</a>')) {
            onresult('N/A', chunk, id);
          } else {
            onresult(text, chunk, id);
          }
        } else if (res.status >= 500) {
          onresult('N/A', chunk, id);
        } else {
          onresult(undefined, chunk, id);
        }
      })
      .catch(() => onresult(undefined, chunk, id));
    
    if (pf) pf(pn+=96/total/INTRADAY_UPDATE_RETRY_COUNT/2);
  }
  
  function batch(chunks=[]) {
    if (qeudRetry) qeudRetry = undefined;
    let ids = chunks.map((v,i) => 'a'+i);
    for (let i=0, delay=0, n=chunks.length; i<n; i++, delay+=INTRADAY_UPDATE_CHUNK_DELAY) {
      let id = ids[i];
      let t = setTimeout(request, delay, chunks[i], id);
      timeouts.set(id, t);
    }
  }
  
  async function start(inscode_devens, _pf) {
    pf = _pf;
    pn = 4;
    src = objify( inscode_devens.map(([a,b]) => [ a, b.map(i=>[i,undefined]) ]) );
    let chunks = [...inscode_devens].reduce((r,[inscode,devens]) => r=[...r, ...(devens ? devens.map(i=>[0,inscode,''+i]) : []) ], []);
    total = chunks.length;
    succs = [];
    fails = [];
    retries = 0;
    retrychunks = [];
    timeouts = new Map();
    qeudRetry = undefined;
    writing = [];
    
    batch(chunks);
    
    poll();
    
    return new Promise(r => resolve = r);
  }
  
  return start;
})();

async function getIntraday(symbols=[], _settings={}) {
  if (!symbols.length) return;
  const result = { data: [], error: undefined };
  let { onprogress: pf } = _settings;
  if (typeof pf !== 'function') pf = undefined;
  let pn = 0;
  
  const err = await updateInstruments();
  if (pf) pf(++pn);
  if (err) {
    const { title, detail } = err;
    result.error = { code: 1, title, detail };
    if (pf) pf(100);
    return result;
  }
  
  const instruments = parseInstruments(true, undefined, 'Symbol');
  const selection = symbols.map(i => instruments[i]);
  const notFounds = symbols.filter((v,i) => !selection[i]);
  if (pf) pf(++pn);
  if (notFounds.length) {
    result.error = { code: 2, title: 'Incorrect Symbol', symbols: notFounds };
    if (pf) pf(100);
    return result;
  }
  
  const selins = new Set(selection.map(i => i && i.InsCode));
  
  let storedInscodeDevens = await storage.getItemAsync('tse.inscode_devens', true);
  storedInscodeDevens = storedInscodeDevens ? storedInscodeDevens.split('@').map(i=>i.split(';')).map(([i,d]) => [i,d.split(',').map(i=>+i)]): [];
  const storedInscodes = new Set(storedInscodeDevens.map(i => i[0]));
  
  if ( !storedInscodeDevens || [...selins].find(i => !storedInscodes.has(i)) ) {
    await parseStoredPrices();
    
    const { succs, fails, error } = await updatePrices(selection);
    if (error) {
      const { title, detail } = error;
      result.error = { code: 1, title, detail };
      if (pf) pf(100);
      return result;
    }
    
    if (fails.length) {
      const _selection = selection.reduce((a, {InsCode,Symbol}) => (a[InsCode] = Symbol, a), {});
      result.error = { code: 3, title: 'Incomplete Price Update',
        fails: fails.map(k => _selection[k]),
        succs: succs.map(k => _selection[k])
      };
      selection.forEach((v,i,a) => fails.includes(v.InsCode) ? a[i] = undefined : 0);
    }
    
    storedInscodeDevens = Object.keys(storedPrices).map(inscode => {
      const prices = storedPrices[inscode];
      if (!prices) return;
      const devens = prices.split(';').map(i => +i.split(',',2)[1]);
      return [inscode, devens];
    }).filter(i=>i);
    
    const str = storedInscodeDevens.map(([i,d]) => [i, d.join(',')]).map(i => i.join(';')).join('@');
    await storage.setItemAsync('tse.inscode_devens', str, true);
  }
  storedInscodeDevens = Object.fromEntries(storedInscodeDevens);
  if (pf) pf(++pn);
  
  const settings = {...itdDefaultSettings, ..._settings};
  
  /** note:  ↓... let == const (mostly) */
  
  let [startDate, endDate] = [+settings.startDate, +settings.endDate];
  
  let isInRange = endDate
    ? i => i >= startDate && i <= endDate
    : i => i >= startDate;
  
  let askedInscodeDevens = [...selins].map(inscode => {
    if (!inscode) return [];
    let allDevens = storedInscodeDevens[inscode];
    if (!allDevens) return [inscode, []];
    let askedDevens = allDevens.filter(isInRange);
    return [inscode, askedDevens];
  });
  
  stored = await itdstore.getItems(selins);
  
  let toUpdate = askedInscodeDevens.map(([inscode, devens]) => {
    if (!inscode || !devens.length) return;
    if (!stored[inscode]) return [inscode, devens];
    let needupdate = devens.filter(deven => !stored[inscode][deven]);
    if (needupdate.length) return [inscode, needupdate];
  }).filter(i=>i);
  if (pf) pf(++pn);
  
  if (toUpdate.length > 0) {
    let { succs, fails } = await itdUpdateManager(toUpdate, pf);
    
    if (fails.length) {
      let k = selection.reduce((a, {InsCode,Symbol}) => (a[InsCode] = Symbol, a), {});
      let reducer = (o,[i,d]) => (!o[k[i]] && (o[k[i]]=[]), o[k[i]].push(d), o);
      result.error = { code: 4, title: 'Incomplete Intraday Update',
        fails: fails.reduce(reducer, {}),
        succs: succs.reduce(reducer, {})
      };
    }
  }
  if (pf) pf(pn=96);
  
  let { gzip } = settings;
  
  result.data = askedInscodeDevens.map(([inscode, devens]) => {
    let instr = stored[inscode];
    if (!instr) return;
    if (gzip) {
      return devens.map(deven => [ deven, instr[deven] ]);
    } else {
      return devens.map(deven => [ deven, typeof instr[deven] === 'string' ? instr[deven] : unzip(instr[deven]) ]);
    }
  });
  if (pf) pf(100);
  
  return result;
}
//@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
const instance = {
  getPrices,
  getInstruments,
  getIntraday,
  
  get API_URL() { return API_URL; },
  set API_URL(v) {
    if (typeof v !== 'string') return;
    let bad;
    try { new URL(v); } catch (e) { bad = true; throw e; }
    if (!bad) API_URL = v;
  },
  
  get UPDATE_INTERVAL() { return UPDATE_INTERVAL; },
  set UPDATE_INTERVAL(v) { if (Number.isInteger(v)) UPDATE_INTERVAL = v; },
  
  get PRICES_UPDATE_CHUNK() { return PRICES_UPDATE_CHUNK; },
  set PRICES_UPDATE_CHUNK(v) { if (Number.isInteger(v) && v > 0 && v < 60) PRICES_UPDATE_CHUNK = v; },
  
  get PRICES_UPDATE_CHUNK_DELAY() { return PRICES_UPDATE_CHUNK_DELAY; },
  set PRICES_UPDATE_CHUNK_DELAY(v) { if (Number.isInteger(v)) PRICES_UPDATE_CHUNK_DELAY = v; },
  
  get PRICES_UPDATE_RETRY_COUNT() { return PRICES_UPDATE_RETRY_COUNT; },
  set PRICES_UPDATE_RETRY_COUNT(v) { if (Number.isInteger(v)) PRICES_UPDATE_RETRY_COUNT = v; },
  
  get PRICES_UPDATE_RETRY_DELAY() { return PRICES_UPDATE_RETRY_DELAY; },
  set PRICES_UPDATE_RETRY_DELAY(v) { if (Number.isInteger(v)) PRICES_UPDATE_RETRY_DELAY = v; },
  
  get columnList() {
    return [...Array(15)].map((v,i) => ({name: cols[i], fname: colsFa[i]}));
  },
  itdGroupCols
};
if (isNode) {
  Object.defineProperty(instance, 'CACHE_DIR', {
    get: () => storage.CACHE_DIR,
    set: v => storage.CACHE_DIR = v
  });
  module.exports = instance;
} else if (isBrowser) {
  window.tse = instance;
}
})();