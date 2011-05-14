var net = require("net"), sys = require("sys");

var userStore = {};

function sendData(user, json)
{
	if (user && user.stream)
	{
		user.stream.write(json);
	}
	else
	{
		console.log("Do not have stream/user object");
		console.log(user);
		console.log(json);
	}
}

function handleData(data, stream)
{
	try
	{
		var json = JSON.parse(data.replace("\0", ''));
	}
	catch (ex)
	{
		console.log("Failed to parse JSON " + data);
		console.log(ex);
		return;
	}
	
	if (json.command === 'subscribe')
	{
		var client_id = json.client_id;
		stream.client_id = client_id;
		
		if (!client_id || (client_id <= 0))
		{
			console.log("Invalid client_id: " + client_id);
			return;
		}
		
		if (!userStore[client_id])
		{
			console.log("New user " + client_id)
			userStore[client_id] = []; // a user can have multiple connections/tabs open
		}
		
		userStore[client_id].push({
			"stream" : stream,
			"timestamp" : new Date().getTime()
		});
	}
	
	if (json.command === 'broadcast')
	{
		if (json.type === "to_clients")
		{
			if (json.client_ids)
			{
				for (var i = 0; i < json.client_ids.length; i++)
				{
					var user = json.client_ids[i];
					if (userStore[user])
					{
						console.log("Sending to user: " + user + ": " + data);
						userStore[user].forEach(function(u) {
							sendData(u, data);
						});
					}
				}
			}
		}
		else if (json.type === 'to_channels')
		{
			console.log("Send to all: " + data);
			
			// send to all
			Object.keys(userStore).forEach(function(key) {
				userStore[key].forEach(function(user) {
					sendData(user, data);
				});
			});
		}
	}
}

var server = net.createServer(function(stream) {
	stream.setEncoding("utf-8");
	
	stream.on("connect", function() {
		console.log("*** New connection")
	});
	
	stream.on("data", function(data) {
		console.log(data)
		handleData(data, stream);
	});
	
	stream.on("end", function() {
		console.log("Closing socket for: " + stream.client_id);
		
		// client_id is not set when rails contacts us
		// clean up
		if (stream.client_id)
		{
			for (var i = 0; i < userStore[stream.client_id].length; i++)
			{
				var u = userStore[stream.client_id][i];
				if (u && (u.stream === stream))
				{
					userStore[stream.client_id].splice(i, 1);
				}
			}
			
			console.log("*** " + stream.client_id + " has " + userStore[stream.client_id].length + " open connections");
			
			if (userStore[stream.client_id].length === 0)
			{
				delete userStore[stream.client_id];
			}
		}
		
		stream.end();
	});
});

process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err);
});

setInterval(function() {
	// test all connections, if timestamp > max_timestamp then clean
	var now = new Date().getTime();
	var user;
	
	console.log("*** Initiating garbage collector");
	
	Object.keys(userStore).forEach(function(key) {
		user = userStore[key];
		
		if (user)
		{
			if (user.length > 0)
			{
				for (var i = 0, len = user.length; i < len; i++)
				{
					if ((now - user[i].timestamp) > (20 * 60 * 1000))
					{
						console.log("*** Found an old entry for " + key);
						user.splice(i, 1);
						
						if (user.length === 0)
						{
							delete userStore[key];
						}
					}
				}
			}
			else
			{
				delete userStore[key];
			}
		}
	});
	
	console.log("*** End garbage collector");
}, 60000);

server.listen(5001, "127.0.0.1");