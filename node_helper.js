"use strict";

/* Magic Mirror
 * Module: MMM-Todoist-Filters
 */

const NodeHelper = require("node_helper");
const https = require('https');
const querystring = require('querystring');

module.exports = NodeHelper.create({
	start: function() {
		console.log("Starting node helper for: " + this.name);
	},

	socketNotificationReceived: function(notification, payload) {
		if (notification === "FETCH_TODOIST") {
			this.config = payload;
			this.fetchTodos();
		}
	},

	fetchTodos : function() {
		const self = this;
    const postData = JSON.stringify({
      sync_token: "*",
      resource_types: self.config.todoistResourceType
    });

    const options = {
      hostname: "api.todoist.com",
      port: 443,
      path: "/sync/v8/sync",
      method: 'POST',
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
        "Authorization": `Bearer ${self.config.accessToken}`
      }
    }
    const req = https.request(options, (res) => {
      let data = '';
      if ( res.statusCode !== 200 ) {
        console.log("[MMM-Todoist-Filters] API Request Status: " + res.statusCode);
      }
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
  				let taskJson = JSON.parse(data);
  				self.sendSocketNotification("TASKS", taskJson);
      });
    }).on('error', (err) => {
      self.sendSocketNotification("FETCH_ERROR", {
        error: err
      });
      console.error("[MMM-Todoist-Filters] ERROR : " + err.message);
    });
    req.write(postData);
    req.end();
	}
});
