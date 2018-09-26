const static_cache_name = 'procurrency-static-v1';
const img_cache_name = 'procurrency-img-v1';
const currency_store_name = 'currencies2';
const conversion_store_name = 'conversions';
const country_store_name = 'countries2';
const all_caches = [
    static_cache_name
];
const cache_urls = [
    './index.html',
    './static/js/idb.js',
    //'./static/js/app.js',
    // './static/js/init.js',
    'https://fonts.gstatic.com/s/roboto/v15/2UX7WLTfW3W8TclTUvlFyQ.woff',
    'https://fonts.gstatic.com/s/roboto/v15/d-6IYplOFocCacKzxwXSOD8E0i7KZn-EPnyo3HZu7kw.woff'
];

const img_urls = [
    './favicon.ico'
];

let db_promise;
let countries = [];
let currencies = [];
let rates;

self.addEventListener('install', event => {
    console.log('[service worker]: installing sw');
    event.waitUntil(
        cache_assets()
    );
});


self.addEventListener('activate', event => {
    console.log('[service worker]: activating sw');
    event.waitUntil(
        house_keeping()
    );
    //Claim this domain as the client of this SW, making immediate activation on new installs and all other tabs
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    //console.log('[service worker]: fetching from sw');
    requrl = new URL(event.request.url);

    event.respondWith(        
        caches.match(event.request).then(response => response || fetch(event.request), error => {
            console.log('[SW]: fetch: error: ', error.message)
        })
    );
});

self.addEventListener('message', event => {
    console.log('[service worker]: handling message');
    if (event.data.action === 'skipwaiting') self.skipWaiting();
});

function house_keeping(){

    cache_countries();
    cache_currencies();

    caches.keys().then(cache_names => Promise.all(
        cache_names.filter(cache_name => cache_name.startsWith('procurrency-') && !all_caches.includes(cache_name)
            ).map(cache_name => caches.delete(cache_name))
        )
    );

    db_promise = open_db();
    //TODO: Clean the DB here
}

function cache_assets(){
    caches.open(static_cache_name).then(cache => cache.addAll(cache_urls), error => console.log('[SW]install: cache error: ',error.message))
        .catch(error => {
            console.log('[SW: install]: caught:', error.message)
            //TODO: Cache enough to not throw on chrome mobi but also look okay
        });
    
        fetch_countries();
        fetch_currencies();
}

function open_db() {
    self.importScripts('./static/js/idb.js');
    return idb.open('procurrency', 2, upgradeDB => {
        switch(upgradeDB.oldVersion){
            case 0: {
                const conversion_store = upgradeDB.createObjectStore(conversion_store_name, {
                });
            }
            case 1: {
                const curency_store = upgradeDB.createObjectStore(currency_store_name, {
                    keyPath: 'id'
                });
                const country_store = upgradeDB.createObjectStore(country_store_name, {
                });
                const last_used_store = upgradeDB.createObjectStore('lastused', {});
                country_store.createIndex('name', 'name');
                curency_store.createIndex('name', 'currencyName');
            }
        }
    });
}

function make_money({currency_name = 'fake money', currency_symbol = 'replace me', id = 'fakeness'} = {}){
    // If the default method is detected we return undefined
    if(currency_name === 'fake money') return undefined;
    if (currency_symbol === 'replace me') {
        currency_symbol = id;
    }
    return {currencyName: currency_name, currencySymbol: currency_symbol, id: id};
}

function get_currencies(){
    db_promise.then(db => {
        if(!db){
            return;
        }
        const index = db.transaction(currency_store_name).objectStore(currency_store_name).index('name');

        index.getAll().then(data => {
            //TODO: Check validity o data here
            //TODO: Add a call to fetch currencies if the data is invalid here.
            currencies = data;
        })
    });
}

function fetch_currencies(){
    console.log('[SW]: fetching currencies: ')

    fetch('https://free.currencyconverterapi.com/api/v6/currencies').then(response => {
        if(response.ok){
            return response.json();
        }
    }, error => console.log('[SW]: Failed to fetch currencies: ', error))
            .then(response => {
                entries = Object.entries(response['results']);
                
                for(entry of entries){
                    currency = make_money({currency_name : entry[1].currencyName, currency_symbol: entry[1].currencySymbol, id: entry[1].id});
                    currencies.push(currency);
                }
        });
}

function cache_currencies(currency_objs){
    db_promise.then(db => {
        if(!db) return;

        console.log('[SW]: getting trans');
        const trans = db.transaction(currency_store_name, 'readwrite');
        console.log('[SW]: getting store');
        const store = trans.objectStore(currency_store_name);
        
        console.log('[SW]: putting');
        store.put(currency_objs)
        //for (currency of currency_objs){
        //    store.put(currency);
        //}
        console.log('[SW]: put');
        //get_currencies();
    }, error => console.log('[SW]: Error Storing into idb: ', error.message))
        //TODO: .catch( error => console.log('[SW]: idb currency fetch error: ', error.message));
}

//TODO: Add get countries method here

function fetch_countries(){
    fetch('https://free.currencyconverterapi.com/api/v6/countries').then(response => {
        if(response.ok) return response.json;
    }).then(response => {

        for(country of Object.entries(response['results'])){
            countries.push(country[1]);
        }
    });
}

function cache_countries(countries){
    console.log('[SW]: use promise');
    db_promise.then(db => {
        if(!db) return;

        console.log('[SW]: getting trans');
        const trans = db.transaction(country_store_name, 'readwrite');
        console.log('[SW]: getting store');
        const store = trans.objectStore(country_store_name);
        
        console.log('[SW]: putting');
        store.put(countries);
        console.log('[SW]: put');
        //get_currencies();
    }, error => console.log('[SW]: Error querying idb: ', error.message))
        .catch( error => console.log('[SW]: idb currency fetch error: ', error.message));
}

//TODO: add get conversion method here

//FIXME: Sepparate logic of fetch and cache here.
function fetch_rate(url = {}){
    const conversions = url.searchParams.get('q');

    fetch(url).then(response => {if (response.ok){return response.json()}}).then(response => {
        const queries = conversions.split(',');
        const r1 = queries[0];
        const r2 = queries[1];
        rates = {r1: response[queries[0]], r2: response[queries[1]],};  
    });
}

function cache_rate(url = {}){
    const conversions = url.searchParams.get('q');
    const queries = conversions.split(',');
    db_promise.then(db => {
        const store = db.transaction(conversion_store_name, 'readwrite').objectStore(conversion_store_name);
        // Store the conversion rate for the currency pair
        store.put(rates[queries[0]], queries[0]);
        // Store the converse rate for fetch efficiency (save on calls to API)
        store.put(rates[queries[1]], queries[1]);
    }).catch(error => console.log('[SW]: fetch_cache_conv: caching error: ', error.message));
}

function setCountries(){
    fetch('https://free.currencyconverterapi.com/api/v6/countries')
        .then(response => {
            if (response.ok) return response.json()})
                .then(data => {
                    
                    for (country of Object.entries(data['results'])){
                        countries.push(country[1]);
                    }
                });
}
//TODO: Add cache conversion rate method here.