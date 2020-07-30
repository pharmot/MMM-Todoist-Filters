/* global Module */

/* Magic Mirror
 * Module: MMM-Todoist-Filters
 *
 * By Andy Briggs
 *
 * MIT Licensed.
 */

// for PIR Sensor module
let UserPresence = true;

Module.register("MMM-Todoist-Filters", {
    defaults: {
        updateInterval: 10 * 60 * 1000, // every 10 minutes,
        fade: true,
        fadePoint: 0.25,
        displayLastUpdate: false, //add or not a line after the tasks with the last server update time
        displayLastUpdateFormat: "dd - HH:mm:ss", //format to display the last update. See Moment.js documentation for all display possibilities
        maxTitleLength: 40, //10 to 50. Value to cut the line if wrapEvents: true
        wrapEvents: false, // wrap events to multiple lines breaking at maxTitleLength
        displaySubtasks: true, // set to false to exclude subtasks // TODO: make this functional
        displayAvatar: false,
        hideLabelNames: [],
        apiVersion: "v8",
        apiBase: "https://api.todoist.com/sync", //Changed from https://todoist.com/API
        todoistEndpoint: "sync",
        todoistResourceType: '["items", "projects", "collaborators", "user", "labels"]',
        debug: false,
        filters: [{
            name: "Todoist",
            config: {
                maximumEntries: 10,
                sortType: "dueDateAsc",
                showProjectName: true,
                showProjectColor: true,
                showLabels: true,
                showWhenEmpty: true
            },
            criteria: [{
                projects: [],
                excludeProjects: true,
                withinDays: 7
            }]
        }],
    },
    getStyles: function() {
        return ["MMM-Todoist-Filters.min.css"];
    },
    getTranslations: function() {
        return {
            en: "translations/en.json",
            de: "translations/de.json",
            nb: "translations/nb.json"
        };
    },
    start: function() {
        let self = this;
        Log.info(`[${this.name}] Starting module`);

        // Definition of the IntervalID to be able to stop and start it again
        this.updateIntervalID = 0;

        // by default it is considered displayed. Note : core function "this.hidden" has strange behavior, so not used here
        this._hidden = false;

        //to display "Loading..." at start-up
        this.title = "Loading...";
        this.loaded = false;

        if (this.config.accessToken === "") {
            Log.error(`[${this.name}] ERROR: access token not set`);
            return;
        }

        this.sendSocketNotification("FETCH_TODOIST", this.config);

        //add ID to the setInterval function to be able to stop it later on
        this.updateIntervalID = setInterval(function() {
            self.sendSocketNotification("FETCH_TODOIST", self.config);
        }, this.config.updateInterval);
    },
    // called by core when module is not displayed
    suspend: function() {
        this._hidden = true;
        if (self.config.debug) {
            Log.log(`[${this.name}] SUSPEND: ModuleHidden = ${ModuleHidden}`);
        }
        this.GestionUpdateIntervalToDoIst();
    },
    // called by core when module is displayed
    resume: function() {
        this._hidden = false;
        if (self.config.debug) {
            Log.log(`[${this.name}] RESUME: ModuleHidden = ${ModuleHidden}`);
        }
        this.GestionUpdateIntervalToDoIst();
    },
    notificationReceived: function(notification, payload) {
        if (self.config.debug) {
            Log.log(`[${this.name}] Notification Received: ${notification} : payload = ${payload})`);
        }
        if (notification === "USER_PRESENCE") { // notification sent by module MMM-PIR-Sensor. See its doc
            userPresence = payload;
            this.GestionUpdateIntervalToDoIst();
        }
    },
    GestionUpdateIntervalToDoIst: function() {
        if (userPresence === true && this._hidden === false) {
            let self = this;

            // update now
            this.sendSocketNotification("FETCH_TODOIST", this.config);

            //if no IntervalID defined, we set one again. This is to avoid several setInterval simultaneously
            if (this.updateIntervalID === 0) {

                this.updateIntervalID = setInterval(function() {
                    self.sendSocketNotification("FETCH_TODOIST", self.config);
                }, this.config.updateInterval);
            }

        } else { //if (userPresence = false OR ModuleHidden = true)
            Log.log(`[${self.name}] userPresence is false or moduleHidden is true: Stop updating`);
            clearInterval(this.updateIntervalID); // stop the update interval of this module
            this.updateIntervalID = 0; //reset the flag to be able to start another one at resume
        }
    },

    /**
     * Shortens a string if it's longer than maxLength and add a ellipsis to the end
     *
     * @author MichMich (from default calendar module)
     *
     * @param {string} string Text string to shorten
     * @param {number} maxLength The max length of the string
     * @param {boolean} wrapEvents Wrap the text after the line has reached maxLength
     * @returns {string} The shortened string
     */
    shorten: function(string, maxLength, wrapEvents) {
        if (typeof string !== "string") {
            return "";
        }

        if (wrapEvents === true) {
            let temp = "";
            let currentLine = "";
            let words = string.split(" ");

            for (let i = 0; i < words.length; i++) {
                let word = words[i];
                if (currentLine.length + word.length < (typeof maxLength === "number" ? maxLength : 25) - 1) { // max - 1 to account for a space
                    currentLine += (word + " ");
                } else {
                    if (currentLine.length > 0) {
                        temp += (currentLine + "<br>" + word + " ");
                    } else {
                        temp += (word + "<br>");
                    }
                    currentLine = "";
                }
            }

            return (temp + currentLine).trim();
        } else {
            if (maxLength && typeof maxLength === "number" && string.length > maxLength) {
                return string.trim().slice(0, maxLength) + "&hellip;";
            } else {
                return string.trim();
            }
        }
    },
    socketNotificationReceived: function(notification, payload) {
        if (notification === "TASKS") {
            this.filterTodoistData(payload);

            if (this.config.displayLastUpdate) {
                this.lastUpdate = Date.now() / 1000; //save the timestamp of the last update to be able to display it
                Log.log(`[${this.name}] Todoist tasks updated at ${moment.unix(this.lastUpdate).format(this.config.displayLastUpdateFormat)}`);
            }

            this.loaded = true;
            this.updateDom(1000);
        } else if (notification === "FETCH_ERROR") {
            Log.error(`[${this.name}] API request error: ${payload.error}`);
        }
    },
    // create array to put filter/item objects into after filtering and sorting
    filteredItems: [],
    filterTodoistData: function(tasks) {

        let self = this;
        let filters = self.config.filters;
        // get filter criteria in format matching API
        for ( let f of self.config.filters ) {
            if ( f.criteria === undefined ) {
                f.criteria = [];
            }
            f.items = [];
            f.criteria.forEach(c => {
                // convert projects in criteria to array of matching project IDs
                if (c.projects) {
                    c.filterProjects = [];
                    if (c.excludeProjects) {
                        for (let projectObject of tasks.projects) {
                            if (c.projects.includes(projectObject.name)) {
                                break;
                            }
                            c.filterProjects.push(projectObject.id);
                        }
                    } else {
                        for (let projectName of c.projects) {
                            for (let projectObject of tasks.projects) {
                                if (projectObject.name === projectName) {
                                    c.filterProjects.push(projectObject.id);
                                    break;
                                }
                            }
                        }
                    }
                }

                // convert labels in criteria to array of matching label IDs
                if (c.labels) {
                    c.filterLabels = [];
                    if (c.excludeLabels) {
                        for (let labelObject of tasks.labels) {
                            if (c.labels.includes(labelObject.name)) {
                                break;
                            }
                            c.filterLabels.push(labelObject.id);
                        }
                    } else {
                        for (let labelName of c.labels) {
                            for (let labelObject of tasks.labels) {
                                if (labelObject.name === labelName) {
                                    c.filterLabels.push(labelObject.id);
                                    break;
                                }
                            }
                        }
                    }
                }

                // convert priorities in criteria to match API values
                // (in API, p1 = 4, p2 = 3, p3 = 2, p4(none) = 1
                if (c.priority) {
                    c.filterPriority = [];
                    for (let p of c.priority) {
                        c.filterPriority.push(5 - p);
                    }
                }
            });
        };
        // for each item, check against each filter's criteria
        for (let item of tasks.items) {
            let added = false;
            for (let f of self.config.filters) {
                for (let c of f.criteria) {
                    // skip items not matching priority criteria
                    if (c.filterProjects) {
                        if (!c.filterProjects.includes(item.project_id)) {
                            continue;
                        }
                    }

                    // skip items not containing labels in criteria
                    if (c.filterLabels) {
                        let labelMatches = false;
                        if (item.labels.length > 0) {
                            for (let itemLabel of item.labels) {
                                if (c.filterLabels.includes(itemLabel)) {
                                    labelMatches = true;
                                    break;
                                }
                            }
                            if (!labelMatches) {
                                continue;
                            }
                        }
                    }

                    // skip items not matching priority criteria
                    if (c.filterPriority) {
                        if (!c.filterPriority.includes(item.priority)) {
                            continue;
                        }
                    }

                    // skip items with a due date if we only want no-date items
                    if (c.noDate === "only" && item.due !== null) {
                        continue;
                    }

                    // skip no-date items if we want to exclude
                    if (c.noDate === "exclude" && item.due === null) {
                        continue;
                    }

                    if (c.withinDays > 0 && item.due !== null) { //we need to check item due date
                        let oneDay = 24 * 60 * 60 * 1000;
                        let dueDateTime = self.parseDueDate(item.due.date);
                        let dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
                        let now = new Date();
                        let today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        let diffDays = Math.floor((dueDate - today) / oneDay);

                        if (diffDays > c.withinDays) {
                            continue;
                        }
                    }
                    f.items.push(item);
                    added = true;
                    break;
                }

                if ( added ) {
                    break;
                }
            }
        }

        // sort items and push filter object to result array
        self.config.filters.forEach( f => {

            //Used for ordering by date
            f.items.forEach( item => {
                if (item.due === null) {
                    item.due = {};
                    item.due.date = "2100-12-31";
                    item.all_day = true;
                }

                // Used to sort by date.
                item.date = self.parseDueDate(item.due.date);

                // check due date for time
                if (item.due.date.length > 10) {
                    item.all_day = false;
                } else {
                    item.all_day = true;
                }
            });

            // Sort items
            switch (f.config.sortType) {
                case "todoist":
                    f.items = self.sortByTodoist(f.items);
                    break;
                case "dueDateAsc":
                    f.items = self.sortByDueDateAsc(f.items);
                    break;
                case "dueDateDesc":
                    f.items = self.sortByDueDateDesc(f.items);
                    break;
                default:
                    f.items = self.sortByTodoist(f.items);
                    break;
            }

            // Slice by max entries
            if (f.config.maximumEntries > 0) {
                f.items = f.items.slice(0, f.config.maximumEntries);
            }
            self.filteredItems.push({
                name: f.name,
                items: f.items,
                config: f.config
            });
        });
        console.log(self.filteredItems);
    },
    parseDueDate: function(date) {
        let [year, month, day, hour = 0, minute = 0, second = 0] = date.split(/\D/).map(Number);

        // If the task's due date has a timezone set (as opposed to the default floating timezone), it's given in UTC time.
        if (date[date.length - 1] === "Z") {
            return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
        }

        return new Date(year, month - 1, day, hour, minute, second);
    },
    sortByTodoist: function(itemstoSort) {
        itemstoSort.sort(function(a, b) {
            let itemA = a.child_order,
                itemB = b.child_order;
            return itemA - itemB;
        });
        return itemstoSort;
    },
    sortByDueDateAsc: function(itemstoSort) {
        itemstoSort.sort(function(a, b) {
            return a.date - b.date;
        });
        return itemstoSort;
    },
    sortByDueDateDesc: function(itemstoSort) {
        itemstoSort.sort(function(a, b) {
            return b.date - a.date;
        });
        return itemstoSort;
    },
    createCell: function(className, innerHTML) {
        let cell = document.createElement("div");
        cell.className = className;
        cell.innerHTML = innerHTML;
        return cell;
    },
    addDueDateCell: function(item) {
        let className = "xsmall bright tdf-due-date ";
        let innerHTML = "";
        let oneDay = 24 * 60 * 60 * 1000;
        let dueDateTime = this.parseDueDate(item.due.date);
        let dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
        let now = new Date();
        let today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let diffDays = Math.floor((dueDate - today) / (oneDay));
        let diffMonths = (dueDate.getFullYear() * 12 + dueDate.getMonth()) - (now.getFullYear() * 12 + now.getMonth());

        if (diffDays < -1) {
            innerHTML = dueDate.toLocaleDateString(config.language, {
                "month": "short"
            }) + " " + dueDate.getDate();
            className += "tdf-overdue";
        } else if (diffDays === -1) {
            innerHTML = this.translate("YESTERDAY");
            className += "tdf-overdue";
        } else if (diffDays === 0) {
            innerHTML = this.translate("TODAY");
            className += (item.all_day || dueDateTime >= now) ? "tdf-today" : "tdf-overdue";
        } else if (diffDays === 1) {
            innerHTML = this.translate("TOMORROW");
            className += "tdf-tomorrow";
        } else if (diffDays < 7) {
            innerHTML = dueDate.toLocaleDateString(config.language, {
                "weekday": "short"
            });
        } else if (diffMonths < 7 || dueDate.getFullYear() == now.getFullYear()) {
            innerHTML = dueDate.toLocaleDateString(config.language, {
                "month": "short"
            }) + " " + dueDate.getDate();
        } else if (item.due.date === "2100-12-31") {
            innerHTML = "";
        } else {
            innerHTML = dueDate.toLocaleDateString(config.language, {
                "month": "short"
            }) + " " + dueDate.getDate() + " " + dueDate.getFullYear();
        }

        if (innerHTML !== "" && !item.all_day) {
            innerHTML += this.formatTime(dueDateTime);
        }

        return this.createCell(className, innerHTML);
    },
    formatTime: function(d) {
        let h = d.getHours();
        let n = d.getMinutes();
        let m = (n < 10 ? "0" : "") + n;
        if (config.timeFormat == 12) {
            return " " + (h % 12 || 12) + ":" + m + (h < 12 ? " AM" : " PM");
        } else {
            return " " + h + ":" + m;
        }
    },
    addAssigneeAvatarCell: function(item, collaboratorsMap) {
        let avatarImg = document.createElement("img");
        avatarImg.className = "tdf-avatar-img";

        let colIndex = collaboratorsMap.get(item.responsible_uid);
        if (typeof colIndex !== "undefined" && this.tasks.collaborators[colIndex].image_id != null) {
            avatarImg.src = "https://dcff1xvirvpfp.cloudfront.net/" + this.tasks.collaborators[colIndex].image_id + "_big.jpg";
        } else {
            avatarImg.src = "/modules/MMM-Todoist/1x1px.png";
        }

        let cell = this.createCell("", "tdf-avatar-wrapper");
        cell.appendChild(avatarImg);

        return cell;
    },
    getDom: function() {
        let self = this;
        if (self.config.hideWhenEmpty && self.tasks.items.length === 0) {
            return null;
        }

        let wrapper = document.createElement("div");

        //display "loading..." if not loaded
        if (!self.loaded) {
            wrapper.innerHTML = "Loading...";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        wrapper.className = "normal light small";

        if (self.tasks === undefined) {
            return wrapper;
        }

        // create mapping from user id to collaborator index
        let collaboratorsMap = new Map();

        for (let i=0; i < this.tasks.collaborators.length; i++) {
            collaboratorsMap.set(this.tasks.collaborators[i].id, i);
        }

        // Check each filter group for project name/color display config so
        // those div's won't be created if not needed
        let anyProjectNames = false,
            anyProjectColors = false;
        for (let f of self.filteredItems) {
            if (f.config.showProjectName) {
                anyProjectNames = true;
            }
            if (f.config.showProjectColor) {
                anyProjectColors = true;
            }
            if (anyProjectNames && anyProjectColors) {
                break;
            }
        }

        // add class to define css grid according to what is shown
        let gridColumns = ( anyProjectColors ? "x" : "o" ) +
            ( anyProjectNames ? "x" : "o" ) +
            ( self.config.displayAvatar ? "x" : "o" );

        let grid = document.createElement("div");
        grid.className = "tdf-grid-container tdf-grid-" + gridColumns;
        self.filteredItems.forEach(f => {
            if (f.items.length === 0 && !f.config.showWhenEmpty) {
                console.log(`${f.name} has no items and is not shown when empty`);
                return;
            }

            if (f.name) {
                let filterHeading = document.createElement("div");
                filterHeading.className = "tdf-heading";
                filterHeading.innerHTML = f.name;
                grid.appendChild(filterHeading);
            }

            if ( f.items.length === 0 ) {
                console.log(`${f.name} has no items`);
                let emptyDiv = document.createElement("div");
                emptyDiv.className = "tdf-empty dimmed xsmall light";
                emptyDiv.innerHTML = this.translate("NOTASKS");
                grid.appendChild(emptyDiv);

            } else {

                f.items.forEach(item => {

                    // add priority div
                    let priorityClassName = item.priority === 4 ? "tdf-p1" :
                        item.priority === 3 ? "tdf-p2" :
                        item.priority === 2 ? "tdf-p3" :
                        "";

                    grid.appendChild(this.createCell("tdf-priority " + priorityClassName, "&nbsp;"));

                    // add title div
                    let taskTitleInner = this.shorten(item.content, this.config.maxTitleLength, this.config.wrapEvents);
                    if ( f.config.showLabels && item.labels.length > 0 ) {
                        item.labels.forEach(itemlabel => {
                            let labelObject = self.tasks.labels.find(lbl => lbl.id === itemlabel);
                            if ( !self.config.hideLabelNames.includes(labelObject.name) ){
                                taskTitleInner += `<span class='tdf-label tdf-color-${labelObject.color}'>${labelObject.name}</span>`;
                            }
                        });
                    }

                    let titleDiv = document.createElement("div");
                    titleDiv.innerHTML = taskTitleInner;
                    titleDiv.className = "tdf-title bright";
                    grid.appendChild(titleDiv);

                    // add due date div
                    grid.appendChild(this.addDueDateCell(item));

                    // add project divs
                    if (anyProjectNames || anyProjectColors) {
                        let project = self.tasks.projects.find(p => p.id === item.project_id);
                        if (anyProjectColors) {
                            if (f.config.showProjectColor) {
                                grid.appendChild(this.createCell("tdf-proj-color tdf-color-" + project.color, "&nbsp;"));
                            } else {
                                grid.appendChild(this.createCell("tdf-proj-color tdf-color-none", "&nbsp;"));
                            }
                        }
                        if (anyProjectNames) {
                            grid.appendChild(this.createCell("dimmed xsmall tdf-proj-name", f.config.showProjectName ? project.name : "&nbsp;"));
                        }
                    }

                    // add avatar div
                    if (self.config.displayAvatar) {
                        grid.appendChild(self.addAssigneeAvatarCell(item, collaboratorsMap));
                    }
                });
            }
        });
        wrapper.appendChild(grid);
        // display the update time at the end, if defined so by the user config
        if (self.config.displayLastUpdate) {
			let updateinfo = document.createElement("div");
			updateinfo.className = "xsmall light align-left";
			updateinfo.innerHTML = "Updated: " + moment.unix(this.lastUpdate).format(this.config.displayLastUpdateFormat);
			wrapper.appendChild(updateinfo);
		}
        return wrapper;
    }
});
