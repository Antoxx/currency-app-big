/*
 * dates: #aspnetForm > table.data > tbody > tr > td:not(.right)
 * today-usd-rate: #aspnetForm > table.data > tbody > tr > td:nth-child(2)
 * today-usd-volume: #aspnetForm > table.data > tbody > tr > td:nth-child(3)
 * today-eur-rate: #aspnetForm > table.data > tbody > tr > td:nth-child(6)
 * today-eur-volume: #aspnetForm > table.data > tbody > tr > td:nth-child(7)
 */

var http = require('http');
var port = parseInt(process.env.PORT, 10) || 3000;
var iHelper = require('./inno-helper');
var anyBody = require("body/any");
var fs = require('fs');
var array = require('array-extended');

/*
var vars = {
    bucketName: 'bc1',
    appKey: '5L8tri055tav3IWK',
    appName: 'aaa',
    groupId: 230,
    apiUrl: 'http://prerelease.innomdc.com'
};
*/
var vars = {
    bucketName: process.env.INNO_BUCKET_ID,
    appKey: process.env.INNO_APP_KEY,
    appName: process.env.INNO_APP_ID,
    groupId: process.env.INNO_COMPANY_ID,
    apiUrl: process.env.INNO_API_HOST
};
iHelper.setVars(vars);

var currencyGetter = {
    cacheTtl: 3600,
    cacheKey: 'rates',
    getSavedData: function () {
        var data = iHelper.getCache(this.cacheKey);
        return data;
    },
    renderData: function (data, options) {
        if (!options) {
            options = {};
        }
        
        var currency = options.currency || 'USD';
        var allKeys = ['date', 'todayUsdRate', 'todayUsdVolume', 'todayEurRate', 'todayEurVolume'];
        var allTitles = ['Date', 'USD rate', 'USD volume', 'EUR rate', 'EUR volume'];
        var titles = ['Date', 'USD rate', 'USD volume', 'EUR rate', 'EUR volume'].join('    ');
        if (!data) {
            return 'No data at all!!!';
        }
        
        var visibleKeys = ['date'];
        if (currency === 'USD') {
            visibleKeys = visibleKeys.concat(['todayUsdRate', 'todayUsdVolume']);
        } else {
            visibleKeys = visibleKeys.concat(['todayEurRate', 'todayEurVolume']);
        }
        
        var titles = [];
        visibleKeys.forEach(function (key) {
            var idx = allKeys.indexOf(key);
            if (idx !== -1) {
                titles.push(allTitles[idx]);
            }
        });
        
        var res = [titles.join(' ')];
        data.forEach(function (row) {
            var vals = [];
            var key;
            for (key in row) {
                if (visibleKeys.indexOf(key) !== -1) {
                    vals.push(row[key]);
                }
            }
            res.push(
                vals.join(' ')
            );
        });
        
        return res.join('\n');
    },
    parseData: function (data) {
        var res = [];
        var values = data.data; // DDs from the event
        if (!values.dates) {
            return res;
        }
        
        var dates = values.dates.split(',');
        var todayUsdRate = values['today-usd-rate'].replace(/\,/g, '.').match(/(\d{2,3}.\d{4})+/gi);
        var todayUsdVolume = values['today-usd-volume'].match(/((\d+)?\s?\d{3},\d{4})+/gi).map(function(v){return v.replace(/[\s\,]/g, '');});
        var todayEurRate = values['today-eur-rate'].replace(/\,/g, '.').match(/(\d{2,3}.\d{4})+/gi);
        var todayEurVolume = values['today-eur-volume'].match(/((\d+)?\s?\d{3},\d{4})+/gi).map(function(v){return v.replace(/[\s\,]/g, '');});
        dates.forEach(function (str, idx) {
            //var parts = str.split('.');
            //var date = new (Date.bind(Date, parts[2], parts[1], parts[0]))();
            
            res.push({
                date: str,//+date,
                todayUsdRate: +todayUsdRate[idx],
                todayUsdVolume: +todayUsdVolume[idx],
                todayEurRate: +todayEurRate[idx],
                todayEurVolume: +todayEurVolume[idx]
            });
        });
        
        return res;
    },
    saveData: function (data) {
        var cachedTime = iHelper.cachedTime;
        iHelper.cachedTime = this.cacheTtl;
        iHelper.setCache(this.cacheKey, data);
        iHelper.cachedTime = cachedTime;
        return data;
    },
    getMinMax: function (data) {
        return {
            minTodayUsdRate: Math.min.apply(null, array.pluck(data, 'todayUsdRate')),
            maxTodayUsdVolume: Math.min.apply(null, array.pluck(data, 'todayUsdVolume')),
            minTodayEurRate: Math.min.apply(null, array.pluck(data, 'todayEurRate')),
            maxTodayEurVolume: Math.min.apply(null, array.pluck(data, 'todayEurVolume'))
        };
    }
};

http.createServer(function (req, res) {
    var data, content;
    if (req.method === 'GET') {
        content = '';
        if (req.url.indexOf('/frontend/') !== -1) {
            //console.log(req.url);
            fs.readFile('..' + req.url, {}, function (error, content) {
                if (error) {
                    res.end();
                    return;
                }
                
                res.end(content);
            });
        } else {
            iHelper.getSettings(function (error, settings) {
                if (error) {
                    res.end(error.message);
                    return;
                }
                
                data = currencyGetter.getSavedData();
                content = currencyGetter.renderData(data, settings);
                res.end(content);
            });            
        }
    } else {
        anyBody(req, res, { encoding:'utf8' }, function (error, body) {
            if (error) {
                console.log(error.message);
                res.end(error.message);
                return;
            }
            
            iHelper.getDatas({body: body}, function (error, data) {
                var parsedData = currencyGetter.parseData(data);
                if (error) {
                    res.end(error.message);
                    return;
                }
                
                currencyGetter.saveData(parsedData);
                
                iHelper.setAttributes(currencyGetter.getMinMax(parsedData), function (error) {
                    if (error) {
                        console.log(error.message);
                        res.end(error.message);
                        return;
                    }
                    
                    res.end();
                });
            });
        });
    }
}).listen(port);

console.log('Server started at %s port', port);