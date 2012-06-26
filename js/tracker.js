var IS_TRACKING = false;
 
var LOCATION_TRACKER = null;

var FEEDBACK = null;

var TIMEOUT = 20000;
var FREQUENCY = 30000;
//var URL = 'http://dev-server.ruuvitracker.fi/api/v1-dev/events';
//var URL = 'http://localhost:9000/api/v1-dev/events';
var URL = 'http://ruuvi-server.herokuapp.com/api/v1-dev/events';

var ENABLE_RUUVITRACKER = true;

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
    $("#trackingStatus").html("Tracking started " + new Date().toISOString());
    showCurrentOperation("Initializing tracking.");
    IS_TRACKING = true;
    enableLocationTracking();
}

function stopTracking(button) {
    console.log("stopTracking()", button);
    showCurrentOperation("Tracking stopped.");
    $("#trackingStatus").html("Tracking stopped " + new Date().toISOString());
    IS_TRACKING = false;
    disableLocationTracking();
}

function isTracking() {
    return IS_TRACKING;
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

function showCurrentOperation(message) {
    $("#currentOperation").html(message);
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
    $("#feedbackArea").html(message);
    $(".latitude").html(formatCoordinate(position.coords.latitude));
    $(".longitude").html(formatCoordinate(position.coords.longitude));
    geocode(position.coords,
	    function(data) {
		showCurrentOperation("Sleeping.");
		if(!data.address) {
		    $("#addressArea").hide();
		    return;
		}
		$("#addressArea").show();

		if(data.display_name){
		    $("#compoundAddress").html(data.display_name);
		    $("#compoundAddress").show();
		} else {
		    $("#compoundAddress").hide();
		}

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
    displayLocation(position, message);
    if(ENABLE_RUUVITRACKER) {
	sendToServer(position, message);
    }
}

function sendToServer(position, message) {
    showCurrentOperation("Sending data to RuuviTracker server.");
    jsonMessage = generateJsonMessage('foobar', 'foobar', position, message);
    var logCallback = function(data, textStatus, jqXHR) {
	console.log("AJAX sent:", data, textStatus, jqXHR);
    };
    sendAjaxRequest(URL, jsonMessage);
}

// geocoding
function geocode(coords, successCallback, errorCallback) {
    showCurrentOperation("Geocoding coordinates.");
    $.get('http://nominatim.openstreetmap.org/reverse',
	  {format: 'json', lat: coords.latitude, lon: coords.longitude}, 
	  function(data) {
	      showCurrentOperation("Geocoding coordinates. Done.");
	      successCallback(data);
	  });
}

function enableLocationTracking() {
    
    var onSuccess = function(position) {
	showCurrentOperation("Fetching location. Done.");
	sendLocationMessage(position);
    }
    var onError = function(error) {
	showCurrentOperation("Fetching location. Failed.");
	handleLocationError(data);
    };
    showCurrentOperation("Fetching location.");
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

function sendAjaxRequest(url, message, successCallback, errorCallback) {
    console.log("INFO: sendAjaxMessage(", message, ")");
    $.ajax({type: 'POST',
	    url: url,
	    data: JSON.stringify(message),
	    data: message,
	    success: successCallback,
	    error: errorCallback,
	    dataType: 'json',
	    processData: false
	    contentType: 'application/json'
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
    // TODO add session_code 
    // generate on first request, and keep it same for rest of the session
    trackerMessage = {
	version: 1,
	tracker_code: trackerCode,
	time: new Date(position.timestamp).toISOString()
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
	// TODO doesn't work yet. RuuviTracker doesn't support yet decimal coordinates
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
