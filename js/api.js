(function(w, $) {
	
	var mongoHost = "10.65.221.102";
	var mongoPort = 27080;
	var mode = 'latest';
	var latestGameId = -1;
	var secondLatestGameId = -1;
	var gamesCount = {};
	var flagsCount = 20 //There are 19 flags around + "no flag"


	var Api = function() {		
	};

	Api.prototype.init = function() {
		var ret = $.Deferred();
		getLatestGameId().then(countGames).then(function() {
			ret.resolve();			
		});
		return ret;
	};

	Api.prototype.setMode = function(newMode) {
		mode = newMode;
	};

	Api.prototype.getGameTimestamp = function() {
		if(mode === 'latest') {
			return new Date(latestGameId * 1000);
		} else if(mode === 'second-latest') {
			return new Date(secondLatestGameId * 1000);
		} else {
			return "";
		}
	}

	var getLatestGameId = function() {
		var self = this;
		var params = {
			"sort" : '{"start":-1}',		
			"limit" : 2
		};

		var ret = $.Deferred();
		executeGet('/games', 'find', params).done(function(resp) {					
			latestGameId = resp.results[0].start;
			secondLatestGameId = resp.results[1].start;	

			ret.resolve(self.latestGameId);
		});	
		return ret;
	};

	Api.prototype.getKillsByPlayer = function() {		
		return getCountByField('playerkilled', 'player');
	};

	Api.prototype.getPassiveKillsByPlayer = function() {		
		return getCountByField('playerkilled', 'target');
	};

	Api.prototype.getGamesPlayedByPlayer = function() {		
		return getCountByField('playerjoin', 'player');
	};	

	Api.prototype.getKillsByFlag = function() {		
		return getCountByField('playerkilled', 'argument', function(val) {			
			return {
				label: val['_id']['label'],
				count: mode === 'weighted' ? val.count / flagsCount : val.count
			};		
		});
	};

	Api.prototype.getShotsByPlayer = function() {		
		return getCountByField('shotfired', 'player');
	};

	var countGames = function() {
		var command = {
			"aggregate": "events",
			"pipeline": [
				{$match: {"@type": 'playerjoin'}}, 
				{"$group": {"_id": "$@player", "count": {"$sum": 1}}}
			]
		};
		var ret = $.Deferred();
		executePost('/games', command).done(function(resp) {			
			$.each(resp.result, function(index, val) {
				gamesCount[val['_id']] = val.count;
			});			
			ret.resolve();
		});
		return ret;
	};

	var getCountByField = function(variable, field, transform) {
		var command = {
			"aggregate": "events",
			"pipeline": [
				{$match: {"@type": variable}}, 
				{$group: {_id: {"label": "$@" + field}, count: {$sum: 1}}},
				{$sort: {count: -1}}
			]
		};

		if(mode === 'latest') {
			command.pipeline[0]['$match']['@game'] = latestGameId;
		} else if(mode === 'second-latest') {
			command.pipeline[0]['$match']['@game'] = secondLatestGameId;
		}

		if(!transform) {
			transform = function(val) {
				return {
					label: val['_id']['label'],
					count: mode === 'weighted' ? val.count / gamesCount[val['_id']['label']] : val.count
				};
			};
		}
				
		var ret = $.Deferred();
		executePost('/events', command).done(function(resp) {
			console.log(resp);
			var result = [];				
			$.each(resp.result, function(index, val) {								
				result.push(transform(val));
			});
			ret.resolve(result);
		});
		return ret;
	};

	Api.prototype.getNemeses = function() {

		var command = {
			"aggregate": "events",
			"pipeline": [
				{$match: {"@type": 'playerkilled'}},
				{$group: {
					_id: {"killer": "$@target","killed": "$@player"}, 
					count: {$sum: 1}
					}
				},
				{ $sort: { count: -1 } },
				{ $limit: 10}
			]
		};

		if(mode === 'latest') {
			command.pipeline[0]['$match']['@game'] = latestGameId;
		} else if(mode === 'second-latest') {
			command.pipeline[0]['$match']['@game'] = secondLatestGameId;
		}
		
		
		var ret = $.Deferred();
		executePost('/events', command).done(function(resp) {
			var result = [];			
			$.each(resp.result, function(index, val) {								
				result.push({
					label: val['_id']['killer'] + " vs. " + val['_id']['killed'],
					count: val.count
				});
			});
			ret.resolve(result);
		});
		return ret;
	};

	Api.prototype.getPickupsByPlayer = function() {
		var command = {
			"aggregate": "events",
			"pipeline": [
				{$match: {"@type": 'flaggrabbed',"@target":{$in:["L","GM","ST","SW","CL","G"]}}},
				{$group: {
					_id: {"flag": "$@target","player": "$@player"}, 
					count: {$sum: 1}
					}
				},
				{ $sort: { count: -1 } },
				{ $limit: 20}
			]
		};

		if(mode === 'latest') {
			command.pipeline[0]['$match']['@game'] = latestGameId;
		} else if(mode === 'second-latest') {
			command.pipeline[0]['$match']['@game'] = secondLatestGameId;
		}
				
		var ret = $.Deferred();
		executePost('/events', command).done(function(resp) {
			var result = [];			
			$.each(resp.result, function(index, val) {	
				var cur = {
					label: val['_id']['player'] + " - " + val['_id']['flag'],
					count: val.count
				};				
				if(mode === 'weighted') {					
					cur.count = cur.count / gamesCount[val['_id']['player']];
				}			
				result.push(cur);
			});
			ret.resolve(result);
		});
		return ret;
	};

	Api.prototype.getShotEfficiency = function() {
		var command = {
			"aggregate": "events",
			"pipeline": [
				{$match: {"@type": {"$in": ['shotfired', 'playerkilled']}}},
				{$group: {
					_id: {"player": "$@player","type": "$@type"}, 
					count: {$sum: 1}
					}
				},				
				{$sort: {"_id.type": -1}},
				{$group: {_id: {"player": "$_id.player"}, counts: {$push: "$count"}}}
			]
		};

		if(mode === 'latest') {
			command.pipeline[0]['$match']['@game'] = latestGameId;
		} else if(mode === 'second-latest') {
			command.pipeline[0]['$match']['@game'] = secondLatestGameId;
		}

		var ret = $.Deferred();
		executePost('/events', command).done(function(resp) {	
			var result = [];			
			$.each(resp.result, function(index, val) {		
				var cur = {					
					label: val['_id']['player'],
					count: (val.counts[1] / val.counts[0])
				};				
				result.push(cur);
			});
			ret.resolve(result);
		});
		return ret;
	}

	var executeGet = function(collection, command, params) {
		var url = "http://" + mongoHost + ":" + mongoPort + "/bzrank" + collection + "/_" + command + '?' + $.param(params);
		return $.get(url, null, 'json');
	};

	var executePost = function(collection, command) {
		var url = "http://" + mongoHost + ":" + mongoPort + "/bzrank" + collection + "/_cmd";
		return $.post(url, 'cmd=' + JSON.stringify(command), null, 'json');
	};

	window.api = new Api();

})(window, jQuery);
