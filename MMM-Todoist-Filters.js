/* Magic Mirror
 * Module: MMM-Todoist-Filters
 *
 * By Andy Briggs
 *
 * MIT Licensed.
 */

Module.register("MMM-Todoist-Filters", {
    defaults: {
        updateInterval: 10 * 60 * 1000, // in ms (default every 10 minutes)
        fade: true,
        fadePoint: 0.25,
        displayLastUpdate: false, //add or not a line after the tasks with the last server update time
        displayLastUpdateFormat: "M/D HH:mm", //format to display the last update. See Moment.js documentation for all display possibilities
        maxTitleLength: 40, //10 to 50. Value to cut the line if wrapEvents: true
        wrapEvents: false, // wrap events to multiple lines breaking at maxTitleLength
        displaySubtasks: true, // set to false to exclude subtasks
        displayAvatar: false,
        hideLabelNames: [],
        apiVersion: "v8",
        apiBase: "https://api.todoist.com/sync", //Changed from https://todoist.com/API
        todoistEndpoint: "sync",
        todoistResourceType: "[\"items\", \"projects\", \"collaborators\", \"user\", \"labels\"]",
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
        }]
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
        Log.info(`[${this.name}] Starting module`);
        this._hidden = false;
        this._userPresence = true;
        this.title = "Loading...";
        this.loaded = false;
        this.lastUpdate = null;
        this.lastUpdateRequest = null;
        this.updater = null;

        if (this.config.accessToken === "") {
            Log.error(`[${this.name}] ERROR: access token not set`);
            return;
        }
        this.startUpdating();

    },
    startUpdating: function() {
        const self = this;
        this.refreshTodos();
        if ( this.updater === null ) {
            this.updater = setInterval(self.refreshTodos, self.config.updateInterval);
        }
    },
    stopUpdating: function() {
        clearInterval(this.updater);
        this.updater = null;
    },
    refreshTodos: function() {
        if ( this._userPresence === true && this._hidden === false ) {
            if ( this.lastUpdateRequest === null || moment().diff(this.lastUpdateRequest) > this.config.updateInterval ) {
                this.lastUpdateRequest = moment();
                this.sendSocketNotification("FETCH_TODOIST", this.config);
            }
        }
    },
    // called by core when module is not displayed
    suspend: function() {
        this._hidden = true;
        this.tdfLog(`[${this.name}] SUSPEND: ModuleHidden = ${this._hidden}`);
        this.stopUpdating();
    },
    // called by core when module is displayed
    resume: function() {
        this._hidden = false;
        this.tdfLog(`[MMM-Todoist-Filters] RESUME: ModuleHidden = ${this._hidden}`);
        this.startUpdating();
    },
    notificationReceived: function(notification, payload) {
        if ( notification === "USER_PRESENCE" ) { // notification sent by module MMM-PIR-Sensor. See its doc
            this._userPresence = payload;
            if ( this._userPresence ) {
                this.startUpdating();
            } else {
                this.stopUpdating();
            }
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
            const words = string.split(" ");

            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                if (currentLine.length + word.length < (typeof maxLength === "number" ? maxLength : 25) - 1) { // max - 1 to account for a space
                    currentLine += `${word  } `;
                } else {
                    if (currentLine.length > 0) {
                        temp += `${currentLine  }<br>${  word  } `;
                    } else {
                        temp += `${word  }<br>`;
                    }
                    currentLine = "";
                }
            }

            return (temp + currentLine).trim();
        } else {
            if (maxLength && typeof maxLength === "number" && string.length > maxLength) {
                return `${string.trim().slice(0, maxLength)  }&hellip;`;
            } else {
                return string.trim();
            }
        }
    },
    socketNotificationReceived: function(notification, payload) {
        if (notification === "TASKS") {
            this.lastUpdate = moment();
            this.sendNotification("TODOIST_TASKS_UPDATED");
            this.filterTodoistData(payload);
            Log.log(`[${this.name}] Todoist tasks updated at ${this.lastUpdate.format(this.displayUpdateFormat)}`);
            this.loaded = true;
            this.updateDom(1000);
        } else if (notification === "FETCH_ERROR") {
            Log.error(`[${this.name}] API request error: ${payload.error}`);
        }
    },

    filterTodoistData: function(apiTasks) {

        const self = this;
        this.filteredItems = [];
        this.tasks = {
            "items": apiTasks.items,
            "projects": apiTasks.projects,
            "labels": apiTasks.labels,
            "collaborators": apiTasks.collaborators
        };
        self.tdfLog("------------------FILTER TRANSFORM------------------");
        // get filter criteria in format matching API
        for ( const f of self.config.filters ) {
            if ( f.criteria === undefined ) {
                f.criteria = [];
            }
            f.items = [];
            self.tdfLog(`FILTER: ${  f.name}`);
            f.criteria.forEach(c => {
                self.tdfLog("--Criteria group");
                // convert projects in criteria to array of matching project IDs
                if (c.projects) {
                    self.tdfLog(`----Has project criteria, c.excludeProjects = ${c.excludeProjects}`);
                    c.filterProjects = [];
                    if (c.excludeProjects) {
                        for (const projectObject of apiTasks.projects) {
                            if (c.projects.includes(projectObject.name)) {
                                self.tdfLog(`------c.projects includes ${projectObject.name}, not added to criteria`);
                                break;
                            }
                            self.tdfLog(`------c.projects does not include ${projectObject.name}, added to criteria`);
                            c.filterProjects.push(projectObject.id);
                        }
                    } else {
                        for (const projectName of c.projects) {
                            for (const projectObject of apiTasks.projects) {
                                if (projectObject.name === projectName) {
                                    self.tdfLog(`------found match for ${projectName} in API response, added to criteria`);
                                    c.filterProjects.push(projectObject.id);
                                    break;
                                }
                            }
                        }
                    }
                    self.tdfLog(`----Will look for items in project(s): ${c.filterProjects.join(", ")}`);
                } else {
                    self.tdfLog(`----No project criteria`);
                }

                // convert labels in criteria to array of matching label IDs
                if (c.labels) {
                    self.tdfLog(`----Has label criteria, c.excludeLabels = ${c.excludeLabels}`);
                    c.filterLabels = [];
                    if (c.excludeLabels) {
                        for (const labelObject of apiTasks.labels) {
                            if (c.labels.includes(labelObject.name)) {
                                self.tdfLog(`------c.labels includes ${labelObject.name}, not added to criteria`);
                                break;
                            }
                            self.tdfLog(`------c.labels does not include ${labelObject.name}, added to criteria`);
                            c.filterLabels.push(labelObject.id);
                        }
                    } else {
                        for (const labelName of c.labels) {
                            for (const labelObject of apiTasks.labels) {
                                if (labelObject.name === labelName) {
                                    self.tdfLog(`------found match for ${labelName} in API response, added to criteria`);
                                    c.filterLabels.push(labelObject.id);
                                    break;
                                }
                            }
                        }
                    }
                    self.tdfLog(`----Will look for items matching label(s): ${c.filterLabels.join(", ")}`);
                } else {
                    self.tdfLog(`----No label criteria`);
                }

                // convert priorities in criteria to match API values
                // (in API, p1 = 4, p2 = 3, p3 = 2, p4(none) = 1
                if (c.priority) {
                    c.filterPriority = [];
                    for (const p of c.priority) {
                        c.filterPriority.push(5 - p);
                    }
                }
            });
        }
        self.tdfLog("--------------------ITEM FILTER--------------------");
        // for each item, check against each filter's criteria
        for (const item of apiTasks.items) {
            self.tdfLog(`ITEM: ${item.content}`);
            let added = false;
            for (const f of self.config.filters) {
                self.tdfLog(`--checking filter: ${f.name}`);
                for (const c of f.criteria) {
                    // skip items not matching priority criteria
                    if (c.filterProjects) {
                        if (!c.filterProjects.includes(item.project_id)) {
                            self.tdfLog(`----Project ${item.project_id}: no match`);
                            continue;
                        }
                        self.tdfLog(`----Project ${item.project_id}: match, continue`);
                    } else {
                        self.tdfLog(`----Project: N/A`);
                    }

                    // skip items not containing labels in criteria
                    if (c.filterLabels) {
                        let labelMatches = false;
                        if (item.labels.length > 0) {
                            self.tdfLog(`----Labels: ${item.labels.join(", ")}`);
                            for (const itemLabel of item.labels) {
                                if (c.filterLabels.includes(itemLabel)) {
                                    labelMatches = true;
                                    break;
                                }
                            }
                            if (!labelMatches) {
                                self.tdfLog(`------no match`);
                                continue;
                            }
                            self.tdfLog(`------match, continue`);
                        } else {
                            if (!c.excludeLabels) {
                                self.tdfLog(`----Labels: has none, criteria requires, no match`);
                                continue;
                            } else {
                                self.tdfLog(`----Labels: has none, criteria doesn't require, continue`);
                            }
                        }
                    } else {
                        self.tdfLog(`----Labels: N/A`);
                    }

                    // skip items not matching priority criteria
                    if (c.filterPriority) {
                        if (!c.filterPriority.includes(item.priority)) {
                            self.tdfLog(`----Priority: no match`);
                            continue;
                        }
                        self.tdfLog(`----Priority: match, continue`);
                    } else {
                        self.tdfLog(`----Priority: N/A`);
                    }

                    // skip items with a due date if we only want no-date items
                    if (c.noDate === "only" && item.due !== null) {
                        self.tdfLog("----Date: has, but only want noDate");
                        continue;
                    }

                    // skip no-date items if we want to exclude
                    if (c.noDate === "exclude" && item.due === null) {
                        self.tdfLog("----Date: none, but critieria requires");
                        continue;
                    }

                    if (c.withinDays > 0 && item.due !== null) { //we need to check item due date
                        const oneDay = 24 * 60 * 60 * 1000;
                        const dueDateTime = self.parseDueDate(item.due.date);
                        const dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
                        const now = new Date();
                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        const diffDays = Math.floor((dueDate - today) / oneDay);

                        if (diffDays > c.withinDays) {
                            self.tdfLog("----Date: beyond withinDays, no match");
                            continue;
                        }
                        self.tdfLog("----Date: match, continue");
                    }
                    self.tdfLog("----All criteria met, added to this group");
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
    },
    tdfLog: function(x) {
        if (this.config.debug) {
            Log.log(x);
        }
    },
    parseDueDate: function(date) {
        const [year, month, day, hour = 0, minute = 0, second = 0] = date.split(/\D/).map(Number);

        // If the task's due date has a timezone set (as opposed to the default floating timezone), it's given in UTC time.
        if (date[date.length - 1] === "Z") {
            return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
        }

        return new Date(year, month - 1, day, hour, minute, second);
    },
    sortByTodoist: function(itemstoSort) {
        itemstoSort.sort(function(a, b) {
            const itemA = a.child_order,
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
        const cell = document.createElement("div");
        cell.className = className;
        cell.innerHTML = innerHTML;
        return cell;
    },
    addDueDateCell: function(item) {
        let className = "xsmall bright tdf-due-date ";
        let innerHTML = "";
        const oneDay = 24 * 60 * 60 * 1000;
        const dueDateTime = this.parseDueDate(item.due.date);
        const dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffDays = Math.floor((dueDate - today) / oneDay);
        const diffMonths = dueDate.getFullYear() * 12 + dueDate.getMonth() - (now.getFullYear() * 12 + now.getMonth());

        if (diffDays < -1) {
            innerHTML = `${dueDate.toLocaleDateString(this.config.language, {
                "month": "short"
            })  } ${  dueDate.getDate()}`;
            className += "tdf-overdue";
        } else if (diffDays === -1) {
            innerHTML = this.translate("YESTERDAY");
            className += "tdf-overdue";
        } else if (diffDays === 0) {
            innerHTML = this.translate("TODAY");
            className += item.all_day || dueDateTime >= now ? "tdf-today" : "tdf-overdue";
        } else if (diffDays === 1) {
            innerHTML = this.translate("TOMORROW");
            className += "tdf-tomorrow";
        } else if (diffDays < 7) {
            innerHTML = dueDate.toLocaleDateString(this.config.language, {
                "weekday": "short"
            });
        } else if (diffMonths < 7 || dueDate.getFullYear() === now.getFullYear()) {
            innerHTML = `${dueDate.toLocaleDateString(this.config.language, {
                "month": "short"
            })  } ${  dueDate.getDate()}`;
        } else if (item.due.date === "2100-12-31") {
            innerHTML = "";
        } else {
            innerHTML = `${dueDate.toLocaleDateString(this.config.language, {
                "month": "short"
            })  } ${  dueDate.getDate()  } ${  dueDate.getFullYear()}`;
        }

        if (innerHTML !== "" && !item.all_day) {
            innerHTML += this.formatTime(dueDateTime);
        }

        return this.createCell(className, innerHTML);
    },
    formatTime: function(d) {
        const h = d.getHours();
        const n = d.getMinutes();
        const m = (n < 10 ? "0" : "") + n;
        if (this.config.timeFormat === 12) {
            return ` ${  h % 12 || 12  }:${  m  }${h < 12 ? " AM" : " PM"}`;
        } else {
            return ` ${  h  }:${  m}`;
        }
    },
    addAssigneeAvatarCell: function(item, collaboratorsMap) {
        const avatarImg = document.createElement("img");
        avatarImg.className = "tdf-avatar-img";

        const colIndex = collaboratorsMap.get(item.responsible_uid);
        if (typeof colIndex !== "undefined" && this.tasks.collaborators[colIndex].image_id != null) {
            avatarImg.src = `https://dcff1xvirvpfp.cloudfront.net/${  this.tasks.collaborators[colIndex].image_id  }_big.jpg`;
        } else {
            avatarImg.src = "/modules/MMM-Todoist/1x1px.png";
        }

        const cell = this.createCell("", "tdf-avatar-wrapper");
        cell.appendChild(avatarImg);

        return cell;
    },
    getDom: function() {
        const self = this;
        if (self.config.hideWhenEmpty && self.tasks.items.length === 0) {
            return null;
        }

        const wrapper = document.createElement("div");

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
        const collaboratorsMap = new Map();

        for (let i = 0; i < this.tasks.collaborators.length; i++) {
            collaboratorsMap.set(this.tasks.collaborators[i].id, i);
        }

        // Check each filter group for project name/color display config so
        // those div's won't be created if not needed
        let anyProjectNames = false,
            anyProjectColors = false;
        for (const f of self.filteredItems) {
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
        const gridColumns = ( anyProjectColors ? "x" : "o" ) +
            ( anyProjectNames ? "x" : "o" ) +
            ( self.config.displayAvatar ? "x" : "o" );

        const grid = document.createElement("div");
        grid.className = `tdf-grid-container tdf-grid-${  gridColumns}`;
        self.filteredItems.forEach(f => {
            if (f.items.length === 0 && !f.config.showWhenEmpty) {
                return;
            }

            if (f.name) {
                const filterHeading = document.createElement("div");
                filterHeading.className = "tdf-heading";
                filterHeading.innerHTML = f.name;
                grid.appendChild(filterHeading);
            }

            if ( f.items.length === 0 ) {
                const emptyDiv = document.createElement("div");
                emptyDiv.className = "tdf-empty dimmed xsmall light";
                emptyDiv.innerHTML = this.translate("NOTASKS");
                grid.appendChild(emptyDiv);

            } else {

                f.items.forEach(item => {

                    // add priority div
                    const priorityClassName = item.priority === 4 ? "tdf-p1" :
                        item.priority === 3 ? "tdf-p2" :
                            item.priority === 2 ? "tdf-p3" :
                                "";

                    grid.appendChild(this.createCell(`tdf-priority ${  priorityClassName}`, "&nbsp;"));

                    // add title div
                    let taskTitleInner = this.shorten(item.content, this.config.maxTitleLength, this.config.wrapEvents);
                    if ( f.config.showLabels && item.labels.length > 0 ) {
                        item.labels.forEach(itemlabel => {
                            const labelObject = self.tasks.labels.find(lbl => lbl.id === itemlabel);
                            if ( !self.config.hideLabelNames.includes(labelObject.name) ) {
                                taskTitleInner += `<span class='tdf-label tdf-color-${labelObject.color}'>${labelObject.name}</span>`;
                            }
                        });
                    }

                    const titleDiv = document.createElement("div");
                    titleDiv.innerHTML = taskTitleInner;
                    titleDiv.className = "tdf-title bright";
                    grid.appendChild(titleDiv);

                    // add due date div
                    grid.appendChild(this.addDueDateCell(item));

                    // add project divs
                    if (anyProjectNames || anyProjectColors) {
                        const project = self.tasks.projects.find(p => p.id === item.project_id);
                        if (anyProjectColors) {
                            if (f.config.showProjectColor) {
                                grid.appendChild(this.createCell(`tdf-proj-color tdf-color-${  project.color}`, "&nbsp;"));
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
            const updateinfo = document.createElement("div");
            updateinfo.className = "xsmall light align-left";
            updateinfo.innerHTML = `Updated: ${  self.lastUpdate.format(self.config.displayLastUpdateFormat)}`;
            wrapper.appendChild(updateinfo);
        }
        return wrapper;
    }
});
