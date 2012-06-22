var IS_TRACKING = false;
 
var MESSAGE_SCHEDULER = null;

var LOCATION_TRACKER = null;

var FEEDBACK = null;

var TIMEOUT = 10000;
var FREQUENCY = 5000;
var URL = 'http://dev-server.ruuvitracker.fi/api/v1-dev/events';
//var URL = 'http://localhost:9000/api/v1-dev/events';

function bindTrackButton(buttonSelector, feedbackSelector, startTitle, stopTitle) {
    var button = $(buttonSelector);
    FEEDBACK = $(feedbackSelector);
    button.removeAttr('disabled');
    button.click(function() {
	if(isTracking()) {
	    stopTracking($(this));
	    button.html(startTitle);
	} else {
	    startTracking($(this));
	    button.html(stopTitle);
	}
    });
}

function isTrackingSupported() {
    if("geolocation" in navigator) {
	return true;
    }
    return false;
}

function startTracking(button) {
    console.log("startTracking() ", button);
    IS_TRACKING = true;
    scheduleMessageSend();
    //enableLocationTracking();
}

function stopTracking(button) {
    console.log("stopTracking()", button);
    IS_TRACKING = false;
    unscheduleMessageSend();
    //disableLocationTracking();
}

function isTracking() {
    return IS_TRACKING;
}

function sendLocation(message) {
    obtainLocation(function(position) {
	sendLocationMessage(position, message);
	scheduleMessageSend();
    },
		   handleLocationError);
}


function obtainLocation(successHandler, errorHandler) {
    navigator.geolocation.getCurrentPosition(successHandler, errorHandler,
					     {
						 enableHighAccuracy: true,
						 timeout: TIMEOUT
					     });
}

function handleLocationError(error) {
    if(error.code) {
	switch(error.code) {
	case error.TIMEOUT:
	    console.log("WARN: Timeout when obtaining location");
	    //feedbackError("Timeout");
	    break;
	case error.PERMISSION_DENIED:
	    feedbackError("Permission denied");
	    break;
	case error.POSITION_UNAVAILABLE:
	    feedbackError("Position unavailable");
	    break;
	default:
	    feedbackError(error.message);
	    break;
	}
    } else {
	feedbackError(error);
    }
    scheduleMessageSend();
}


function addCssClass(object, cssClass) {
    var existing = object.attr('class');
    if(existing) {
	object.attr('class', existing + " " + cssClass);
    } else {
	object.attr('class', cssClass);
    }
} 
function feedbackInfo(message) {
    console.log("INFO: ", message);
    FEEDBACK.html(message);
    addCssClass(FEEDBACK, "infoFeedback");
}

function feedbackError(error) {
    console.log("ERROR: ", error);
    FEEDBACK.html(error);
    addCssClass(FEEDBACK, "errorFeedback");
}

function formatCoordinate(coord) {
    var s = "" + coord;
    if(s.length > 11) {
	return s.substring(0, 11);
    }
    return s;
}
function displayLocation(position, message) {
    var msg = "Location: " + position.coords.latitude + ', ' + position.coords.longitude + " " + message;
    $("#locationArea").show();
    $("#trackingStatus").html(message);
    $(".latitude").html(formatCoordinate(position.coords.latitude));
    $(".longitude").html(formatCoordinate(position.coords.longitude));
    geocode(position.coords,
	    function(data) {
		console.log("geocode:", data);
		if(!data.address) {
		    $("#addressArea").hide();
		    return;
		}
		$("#addressArea").show();
		function showField(sourceField, destFieldSelector) {
		    var sourceData = data.address[sourceField];
		    var destField = $(destFieldSelector);
		    if(sourceData) {
			destField.html(sourceData);
			destField.show();
		    } else {
			destField.hide();
		    }
		}
		showField("road", ".street-address");
		showField("postcode", ".postal-code");
		showField("city", ".locality");
		showField("country", ".country-name");
	    });
}

function sendLocationMessage(position, message) {
    jsonMessage = generateJsonMessage('foobar', 'foobar', position, message);
    var logCallback = function(data, textStatus, jqXHR) {
	console.log("AJAX sent:", data, textStatus, jqXHR);
    };
    sendAjaxRequest(URL, jsonMessage);
    displayLocation(position, message);
}

// geocoding
function geocode(coords, successCallback, errorCallback) {
    console.log("INFO: sendAjaxMessage(", message, ")");
    $.get('http://nominatim.openstreetmap.org/reverse',
	  {format: 'json', lat: coords.latitude, lon: coords.longitude}, 
	  successCallback);
}

function enableLocationTracking() {
    var firstMessage = true;
    var onSuccess = function(position) {
	if(firstMessage) {
	    firstMessage = false;
	    sendLocationMessage(position, "Tracking started");
	} else {
	    sendLocationMessage(position);
	}
    }
    LOCATION_TRACKER = navigator.geolocation.watchPosition(onSuccess, 
							   handleLocationError,
							   {
							       frequency: TIMEOUT,
							       enableHighAccuracy: true,
							       maximumAge: 10000,
							       timeout: TIMEOUT
							   }
							  );
}

function disableLocationTracking() {
    navigator.geolocation.clearWatch(LOCATION_TRACKER);
}

function unscheduleMessageSend() {
    if(MESSAGE_SCHEDULER) {
	//clearInterval(MESSAGE_SCHEDULER);
	clearTimeout(MESSAGE_SCHEDULER);
	MESSAGE_SCHEDULER = null;
    }
}

function scheduleMessageSend() {
    console.log("INFO: scheduling message send");
    unscheduleMessageSend();
    sendLocation("Tracking started");
    MESSAGE_SCHEDULER = setTimeout(function() {sendLocation() }, FREQUENCY);
    //MESSAGE_SCHEDULER = setInterval(function() {sendLocation() }, FREQUENCY);
}


function sendAjaxRequest(url, message, successCallback, errorCallback) {
    console.log("INFO: sendAjaxMessage(", message, ")");
    $.ajax({type: 'POST',
	    url: url,
	    //data: JSON.stringify(message),
	    data: message,
	    success: successCallback,
	    error: errorCallback,
	    dataType: 'json',
	    processData: false
	    //contentType: 'application/json'
	   });
    
}

/**
   Message Generation
*/
function generateMACBaseString(message) {
    var keys = [];
    for(var key in message) {
	keys.push(key);
    }
    keys.sort();
    var base = "";
    for(var i = 0; i < keys.length; i ++) {
	var key = keys[i];
	base += key + ":" + message[key] +"|"
    }
    return base;
}

function generateMAC(message, sharedSecret) {
    var messageBase = generateMACBaseString(message);
    var hash = CryptoJS.HmacSHA1(messageBase, sharedSecret);
    return hash.toString(CryptoJS.enc.Hex);
}

function generateJsonMessage(trackerCode, sharedSecret, position, message) {
    // TODO session_code
    trackerMessage = {
	version: 1,
	tracker_code: trackerCode,
	time: new Date().toISOString()
    };
    if(message) {
	trackerMessage["X-message"] = message;
    }
    
    function addField(srcObject, destObject, srcField, destField) {
	if(srcObject[srcField]) {
	    destObject[destField] = "" + srcObject[srcField];
	}
    }
    if(position && position.coords) {
	var c = position.coords;
	//addField(c, trackerMessage, "latitude", "latitude");
	//addField(c, trackerMessage, "longitude", "longitude");
	trackerMessage.latitude="4916.46,N"; 
	trackerMessage.longitude="12311.12,W";
	addField(c, trackerMessage, "altitude", "altitude");
	addField(c, trackerMessage, "accuracy", "accuracy");
	addField(c, trackerMessage, "heading", "heading");
	addField(c, trackerMessage, "speed", "speed");
	addField(c, trackerMessage, "altitudeAccuracy", "altitudeAccuracy");
    }
    trackerMessage.mac = generateMAC(trackerMessage, sharedSecret);
    return trackerMessage;
}
