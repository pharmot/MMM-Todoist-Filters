# MMM-Todoist-Filters

![Version](https://img.shields.io/github/package-json/v/pharmot/MMM-Todoist-Filters)
![License](https://img.shields.io/github/license/pharmot/MMM-Todoist-Filters)

This an extension for the [MagicMirror](https://github.com/MichMich/MagicMirror), based largely on the "MMM-Todoist" module by cbrooker.  It can display your Todoist todos, organized into groups defined by filters of project, label, due date, etc. Only one account supported.
The requests to the server will be paused is the module is not displayed (use of a carousel or hidden by Remote-Control for example) or by the use of a PIR sensor and the module MMM-PIR-Sensor. An immediate update will occurs at the return of the module display.

## Installation
Navigate into your MagicMirror's `modules` folder and execute:
```bash
git clone https://github.com/pharmot/MMM-Todoist-Filters.git
cd MMM-Todoist-Filters
npm install
```

## Using the module

Add to the modules array in the `config/config.js` file:

```js
modules: [
    {
        module: 'MMM-Todoist-Filters',
        position: 'top-right', //can be any region - fits best in left or right
        header: 'Todoist', //optional
        config: {
            accessToken: 'xxxxxxxxxxxxxxxxxxxxxx', // Replace with your own token
            updateInterval: 60000, // in ms

            displayLastUpdate: false,
            displayLastUpdateFormat: "M/D HH:mm",
            maxTitleLength: 40,
            wrapEvents: false,
            displaySubtasks: true,
            displayAvatar: false,
            hideLabelNames: [],
            filters: [{
                name: "Todoist",
                config: {
                    // See below for filter configuration options
                },
                criteria: [{
                    // See below for filter criteria options
                }],
            }],
        }
    }
]
```

## Configuration Options

The following properties can be configured:

| Option                    | Default Value    | Possible Values       | Description                     |
| ------------------------- | ---------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `accessToken` | | `string` | Your Todoist access token.  You can get it [here](https://developer.todoist.com/appconsole.html). |
| `updateInterval`          | `600000` | `integer`           | Interval to update tasks (in ms).  Default = 10 minutes. |
| `fade`                    | `true`           | `boolean`           | Fade module content.                     |
| `fadePoint`               | `0.25`             | `0` to `1` | When to start fading the module content. |
| `displayLastUpdate`       | `false`            | `boolean`           |  Add a line at bottom of module with the last time tasks were updated. |
| `displayLastUpdateFormat` | `"M/D HH:mm"`      | `string`            | Date/time format for last update. See Moment.js documentation for all display possibilities |
| `wrapEvents` | `false` | `boolean` | Wrap event title to multiple lines
| `maxTitleLength` | `40` | `10` to `50` | Length to trim task titles (or when to wrap if `wrapEvents: true`) |
| `displaySubtasks` | `true` | `boolean` | Set to false to exclude subtasks |
| `displayAvatar` | `false` | `boolean` | Display avatar images of collaborators assigned to tasks in shared projects. |
| `hideLabelNames` | `[]` | `array of strings` | If you don't want certain labels to appear in the list, include them here (can still use for filtering if hidden). |
| `debug` | `false` | `boolean` | Set to `true` to enable logging. |
| `filters` | | | [See below](#filters) |

### Filters

This configuration option is an array of objects, one for each filter. A task will only appear once, in the first filter where it matches the criteria.

Each filter contains a name (used as a heading, optional), a set of configuration options specific to the filter, and one or more sets of criteria to match.  For example, the following finds all tasks that are either in the "Next" project (regardless of priority) and any tasks in other projects - except "Scheduled" - that *do* have a priority.

```js
filters: [
    {
        name: "Next",
        config: {
            maximumEntries: 20,
            sortType: "todoist",
            showProjectName: true,
            showProjectColor: true,
            showLabels: true,
            showWhenEmpty: false
        },
        criteria: [
            {
                // First look for tasks in the "Next" project
                // regardless of due date or priority.
                projects: ["Next"],
                withinDays: 0,
                noDate: "include",
            },
            {
                // Then look for tasks in any project except "Scheduled"
                // that have a priority 1, 2, or 3
                projects: ["Scheduled"],
                excludeProjects: true,
                withinDays: 0,
                noDate: "include",
                priority: [1, 2, 3],
            }
        ]
    },
]
```
### Filter Configuration

The following properties can be configured in each filter's config:

<table>
<thead>
    <tr>
        <th>Option</th>
        <th>Description</th>
    </tr>
</thead>
<tbody>
    <tr>
        <td><code>sortType</code></td>
        <td>How to sort tasks in this filter.<br><br>
            <b>Possible values:</b><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<code>"dueDateAsc"</code> - sort ascending by due date<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<code>"dueDateDesc"</code> - sort descending by due date<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<code>"todoist"</code> - sort order as defined by todoist data<br>
            <b>Default:</b> <code>"todoist"</code>
        </td>
    </tr>
    <tr>
        <td><code>maximumEntries</code></td>
        <td>The maximum number of tasks to return using this filter.  If not defined or zero, will not have a maximum.<br>
            <b>Possible values:</b> <code>integer</code><br><br>
        <i>(Tasks are first filtered using all criteria sets, are then sorted, then the list is trimmed using the defined maximum)</i></b>
        </td>
    </tr>
    <tr>
        <td><code>showProjectColor</code></td>
        <td>Show a dot with the project color next to each task (colors as defined in Todoist).<br><br>
            <b>Possible values:</b> <code>true</code> or <code>false</code><br>
            <b>Default:</b> <code>false</code></td>
    </tr>
    <tr>
        <td><code>showProjectName</code></td>
        <td>Show the project name next to each task.<br><br>
            <b>Possible values:</b> <code>true</code> or <code>false</code><br>
            <b>Default:</b> <code>false</code></td>
    </tr>
    <tr>
        <td><code>showLabels</code></td>
        <td>Show labels for each task.<br>
            <i>Labels will not be shown if they are included in the module config's </i><code>hideLabelNames</code><i> value.</i><br><br>
            <b>Possible values:</b> <code>true</code> or <code>false</code><br>
            <b>Default:</b> <code>false</code></td>
    </tr>
    <tr>
        <td><code>showWhenEmpty</code></td>
        <td>Set to <code>true</code> to show the filter even when no matching tasks are found. Useful only if filter has a name defined.<br><br>
            <b>Possible values:</b> <code>true</code> or <code>false</code><br>
            <b>Default:</b> <code>false</code></td>
    </tr>

</tbody>
</table>

### Criteria

The following can be configured for each criteria set.  Multiple criteria sets can be used to include tasks in a filter.

<table>
<thead>
    <tr>
        <th>Option</th>
        <th>Description</th>
    </tr>
</thead>
<tbody>
    <tr>
        <td><code>projects</code></td>
        <td>List of projects to use for criteria set based on <code>excludeProjects</code>.<br><br>
            <b>Possible values:</b>array of project names<br>
            <b>Default:</b> <code>[ ]</code><br>
            <b>Example:</b> <code>["Next", "Soon"]</code></td>
    </tr>
    <tr>
        <td><code>excludeProjects</code></td>
        <td>If <code>false</code>, the listed projects are included in the criteria.  If <code>true</code>, the criteria includes all projects <em>except</em> those listed.<br><br>
            <b>Possible values:</b> <code>true</code> or <code>false</code><br>
            <b>Default:</b> <code>false</code>
        </td>
    </tr>
    <tr>
        <td><code>labels</code></td>
        <td>List of labels to use for criteria set based on <code>excludeLabels</code>.<br><br>
            <b>Possible values:</b>array of project names<br>
            <b>Default:</b> <code>[ ]</code><br>
            <b>Example:</b> <code>["email", "at_work"]</code>
        </td>
    </tr>
    <tr>
        <td><code>excludeLabels</code></td>
        <td>If <code>false</code>, the listed labels are included in the criteria.
            If <code>true</code>, the criteria includes all labels <em>except</em> those listed.<br><br>
            <b>Possible values:</b> <code>true</code> or <code>false</code><br>
            <b>Default:</b> <code>false</code></td>
    </tr>
    <tr>
        <td><code>noDate</code></td>
        <td>Whether to include items without a due date.<br><br>
        <b>Possible values:</b><br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<code>"include"</code> - include items with no date<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<code>"exclude"</code> - only include items with a due date<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<code>"only"</code> - only include items with no date<br>
            <b>Default:</b> <code>"include"</code>
        </td>
    </tr>
    <tr>
        <td><code>withinDays</code></td>
        <td>Find tasks that are due within this many days. If <code>0</code> or unspecified, does not use due date in criteria. <br>
            <i>Note: if </i><code>noDate</code> <i>is </i><code>"only"</code><i>, this does not have any effect.</i><br><br>
            <b>Possible values:</b> <code>number</code><br>
            <b>Default:</b> <code>0</code></td>
    </tr>
    <tr>
        <td><code>priority</code></td>
        <td>Find tasks assigned the specified priorities, with 4 being 'no priority.'<br><br>
            <b>Example:</b> <code>[1, 2]</code><br>
            <b>Possible values:</b> <code>array of numbers</code> &ndash; <code>1</code> through <code>4</code><br>
            <b>Default:</b> <code>[ ]</code> <i>(any priority)</i></td>
    </tr>
</tbody>
</table>

## Dependencies
Installed via `npm install`

- [moment](https://www.npmjs.com/package/moment)
- [request](https://www.npmjs.com/package/request)



## Attribution

This project is based on work done by Chris Brooker in the MMM-Todoist module. (https://github.com/cbrooker/MMM-Todoist)

## To-Do

- [ ] Add screenshots
- [ ] Switch from moment to dayjs
