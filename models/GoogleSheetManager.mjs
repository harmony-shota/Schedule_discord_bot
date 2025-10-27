import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM環境で__dirnameをエミュレート
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GoogleSheetManager {
    constructor(sheetId) {
        this.sheetId = sheetId;
        this.sheets = null;
        this.auth = null;
    }

    async authorize() {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, '..', 'credentials.json'), // ダウンロードしたJSONキーファイルのパス
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.auth = await auth.getClient();
        this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    }

    async createTask(taskName, genre, deadline, recurrent, userId) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H'; // シート名と範囲をH列まで拡張
        const values = [[taskName, genre, deadline || '', recurrent || '', 0, userId, 'main', '']]; // 初期進捗0%, parentTaskは空

        const resource = {
            values,
        };
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.sheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource,
        });
        return true;
    }

    async updateTaskProgress(taskName, progress) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:G';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.warn('No tasks found in the spreadsheet.');
            return false;
        }

        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const progressIndex = header.indexOf('progress');

        if (nameIndex === -1 || progressIndex === -1) {
            console.error('Required columns (name or progress) not found in spreadsheet header.');
            return false;
        }

        let rowIndexToUpdate = -1;
        for (let i = 1; i < rows.length; i++) { // Skip header row
            if (rows[i][nameIndex] === taskName) {
                rowIndexToUpdate = i;
                break;
            }
        }

        if (rowIndexToUpdate === -1) {
            console.warn(`Task \'${taskName}\' not found.`);
            return false;
        }

        // スプレッドシートの行番号は1始まり、APIの範囲は0始まりのインデックスを使用するため +1
        const updateRange = `Tasks!${String.fromCharCode(65 + progressIndex)}${rowIndexToUpdate + 1}`;
        const values = [[progress]];

        const resource = {
            values,
        };

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.sheetId,
            range: updateRange,
            valueInputOption: 'USER_ENTERED',
            resource,
        });
        console.log(`Task \'${taskName}\' progress updated to ${progress}%.`);
        return true;
    }

    async addSubtask(parentTaskName, subtaskName, deadline, userId) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H'; // parentTask列を追加したのでHまで
        const values = [[subtaskName, '', deadline || '', '', 0, userId, 'sub', parentTaskName]]; // 初期進捗0%, parentTaskは空

        const resource = {
            values,
        };
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.sheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource,
        });
        await this.updateMainTaskProgress(parentTaskName); // 親タスクの進捗を更新
        return true;
    }

    async getAllTaskNames() {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }
        const header = rows[0];
        const nameIndex = header.indexOf('name');
        if (nameIndex === -1) {
            console.error('Required column (name) not found in spreadsheet header for getAllTaskNames.');
            return [];
        }
        return rows.slice(1).map(row => row[nameIndex]).filter(name => name); // 空のタスク名をフィルタリング
    }

    async getAllMainTaskNames() {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }
        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const typeIndex = header.indexOf('type');
        if (nameIndex === -1 || typeIndex === -1) {
            console.error('Required columns (name or type) not found in spreadsheet header for getAllMainTaskNames.');
            return [];
        }
        return rows.slice(1)
            .filter(row => row[typeIndex] === 'main')
            .map(row => row[nameIndex])
            .filter(name => name);
    }

    async getAllSubtaskNames(parentTaskName = null) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }
        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const typeIndex = header.indexOf('type');
        const parentTaskIndex = header.indexOf('parentTask');
        if (nameIndex === -1 || typeIndex === -1 || parentTaskIndex === -1) {
            console.error('Required columns (name, type, or parentTask) not found in spreadsheet header for getAllSubtaskNames.');
            return [];
        }

        return rows.slice(1)
            .filter(row => row[typeIndex] === 'sub' && (parentTaskName ? row[parentTaskIndex] === parentTaskName : true))
            .map(row => row[nameIndex])
            .filter(name => name);
    }

    async getAllGenres() {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }
        const header = rows[0];
        const genreIndex = header.indexOf('genre');
        if (genreIndex === -1) {
            console.error('Required column (genre) not found in spreadsheet header for getAllGenres.');
            return [];
        }
        const genres = rows.slice(1).map(row => row[genreIndex]).filter(genre => genre);
        return [...new Set(genres)]; // 重複を排除
    }

    async getRecurrentTasks(recurrentType) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }

        const header = rows[0];
        const recurrentIndex = header.indexOf('recurrent');
        const typeIndex = header.indexOf('type');
        const nameIndex = header.indexOf('name');
        const userIdIndex = header.indexOf('userId');

        if (recurrentIndex === -1 || typeIndex === -1 || nameIndex === -1 || userIdIndex === -1) {
            console.error('Required columns not found for getRecurrentTasks.');
            return [];
        }

        return rows.slice(1)
            .filter(row => row[recurrentIndex] === recurrentType && row[typeIndex] === 'main')
            .map(row => ({
                name: row[nameIndex],
                userId: row[userIdIndex],
                // 他に必要な情報があればここに追加
            }));
    }

    async getAllTasksWithDeadlines() {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }

        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const deadlineIndex = header.indexOf('deadline');
        const userIdIndex = header.indexOf('userId');
        const typeIndex = header.indexOf('type');

        if (nameIndex === -1 || deadlineIndex === -1 || userIdIndex === -1 || typeIndex === -1) {
            console.error('Required columns not found for getAllTasksWithDeadlines.');
            return [];
        }

        return rows.slice(1)
            .filter(row => row[deadlineIndex] && row[deadlineIndex] !== '') // 締め切りが設定されているタスクのみ
            .map(row => ({
                name: row[nameIndex],
                deadline: row[deadlineIndex],
                userId: row[userIdIndex],
                type: row[typeIndex],
                // 他に必要な情報があればここに追加
            }));
    }

    async getTasksByGenreForNotifications(genre, filterByDeadline = false) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }

        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const genreIndex = header.indexOf('genre');
        const deadlineIndex = header.indexOf('deadline');
        const userIdIndex = header.indexOf('userId');
        const typeIndex = header.indexOf('type');

        if (nameIndex === -1 || genreIndex === -1 || deadlineIndex === -1 || userIdIndex === -1 || typeIndex === -1) {
            console.error('Required columns not found for getTasksByGenreForNotifications.');
            return [];
        }

        return rows.slice(1)
            .filter(row => {
                const isGenreMatch = row[genreIndex] === genre;
                const isMainTask = row[typeIndex] === 'main';
                const hasDeadline = row[deadlineIndex] && row[deadlineIndex] !== '';

                if (filterByDeadline) {
                    return isGenreMatch && isMainTask && hasDeadline; // 締め切りがあるメインタスクのみ
                } else {
                    return isGenreMatch && isMainTask; // ジャンルが一致するメインタスク全て
                }
            })
            .map(row => ({
                name: row[nameIndex],
                genre: row[genreIndex],
                deadline: row[deadlineIndex],
                userId: row[userIdIndex],
                // 他に必要な情報があればここに追加
            }));
    }

    async getTaskByName(taskName, taskType) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return null;
        }

        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const typeIndex = header.indexOf('type');

        if (nameIndex === -1 || typeIndex === -1) {
            console.error('Required columns (name or type) not found in spreadsheet header for getTaskByName.');
            return null;
        }

        const taskRow = rows.slice(1).find(row => row[nameIndex] === taskName && row[typeIndex] === taskType);
        if (!taskRow) {
            return null;
        }

        return {
            name: taskRow[nameIndex],
            genre: taskRow[header.indexOf('genre')],
            deadline: taskRow[header.indexOf('deadline')],
            progress: parseInt(taskRow[header.indexOf('progress')], 10),
            userId: taskRow[header.indexOf('userId')],
            type: taskRow[typeIndex],
            parentTask: taskRow[header.indexOf('parentTask')],
        };
    }

    async hasSubtasks(mainTaskName) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return false;
        }
        const header = rows[0];
        const typeIndex = header.indexOf('type');
        const parentTaskIndex = header.indexOf('parentTask');

        if (typeIndex === -1 || parentTaskIndex === -1) {
            console.error('Required columns (type or parentTask) not found in spreadsheet header for hasSubtasks.');
            return false;
        }

        return rows.slice(1).some(row => row[parentTaskIndex] === mainTaskName && row[typeIndex] === 'sub');
    }

    async updateSubtaskProgress(subtaskName, progress) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.warn('No tasks found in the spreadsheet.');
            return false;
        }

        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const progressIndex = header.indexOf('progress');
        const typeIndex = header.indexOf('type');
        const parentTaskIndex = header.indexOf('parentTask');

        if (nameIndex === -1 || progressIndex === -1 || typeIndex === -1 || parentTaskIndex === -1) {
            console.error('Required columns not found in spreadsheet header for subtask update.');
            return false;
        }

        let rowIndexToUpdate = -1;
        let parentTaskName = '';
        for (let i = 1; i < rows.length; i++) { // Skip header row
            if (rows[i][nameIndex] === subtaskName && rows[i][typeIndex] === 'sub') {
                rowIndexToUpdate = i;
                parentTaskName = rows[i][parentTaskIndex];
                break;
            }
        }

        if (rowIndexToUpdate === -1) {
            console.warn(`Subtask \'${subtaskName}\' not found.`);
            return false;
        }

        const updateRange = `Tasks!${String.fromCharCode(65 + progressIndex)}${rowIndexToUpdate + 1}`;
        const values = [[progress]];

        const resource = {
            values,
        };

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.sheetId,
            range: updateRange,
            valueInputOption: 'USER_ENTERED',
            resource,
        });
        console.log(`Subtask \'${subtaskName}\' progress updated to ${progress}%.`);

        if (parentTaskName) {
            await this.updateMainTaskProgress(parentTaskName); // 親タスクの進捗を更新
        }
        return true;
    }

    async setConditionalFormatting() {
        if (!this.sheets) await this.authorize();

        const sheetId = 0; // TasksシートのID（最初のシートを想定）

        const requests = [
            // サブタスクの行を薄い水色にするルール
            {
                addConditionalFormatRule: {
                    rule: {
                        ranges: [{
                            sheetId: sheetId,
                            startRowIndex: 1, // ヘッダー行を除く
                        }],
                        booleanRule: {
                            condition: {
                                type: 'CUSTOM_FORMULA',
                                values: [{
                                    userEnteredValue: '=INDIRECT("G"&ROW())= \"sub\"'
                                }],
                            },
                            format: {
                                backgroundColor: {
                                    red: 0.85,
                                    green: 0.92,
                                    blue: 0.95, // 薄い水色 (RGB)
                                },
                            },
                        },
                    },
                    index: 0, // 最初のルールとして追加
                },
            },
        ];

        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.sheetId,
            resource: { requests: requests },
        });
        console.log('✅ Conditional formatting rules applied.');
        return true;
    }

    async sortTasksByDeadline() {
        if (!this.sheets) await this.authorize();

        const sheetId = 0; // TasksシートのID（最初のシートを想定）
        const range = 'Tasks!A2:H'; // ヘッダー行を除く全データ範囲

        // 締め切り日 (deadline) 列でソートするためのリクエスト
        const requests = [
            {
                sortRange: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: 1, // ヘッダー行を除く
                    },
                    sortSpecs: [
                        {
                            dimensionIndex: 2, // deadline列 (C列) の0-basedインデックス
                            sortOrder: 'ASCENDING', // 昇順
                            // dataSourceColumnReference: { name: 'deadline' }, // ヘッダー名で参照（排他的なので削除）
                        },
                    ],
                },
            },
        ];

        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.sheetId,
            resource: { requests: requests },
        });
        console.log('✅ Tasks sorted by deadline.');
        return true;
    }

    async moveTaskToDoneSheet(taskName) {
        if (!this.sheets) await this.authorize();

        const tasksRange = 'Tasks!A:H';
        const tasksResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range: tasksRange,
        });
        const tasksRows = tasksResponse.data.values;
        if (!tasksRows || tasksRows.length === 0) {
            console.warn('No tasks found in the Tasks sheet for moving.');
            return false;
        }

        const header = tasksRows[0];
        const nameIndex = header.indexOf('name');
        const typeIndex = header.indexOf('type');
        const parentTaskIndex = header.indexOf('parentTask');

        if (nameIndex === -1 || typeIndex === -1 || parentTaskIndex === -1) {
            console.error('Required columns not found in Tasks sheet header for moving tasks.');
            return false;
        }

        let tasksToMove = [];
        let rowsToDelete = [];

        for (let i = 1; i < tasksRows.length; i++) { // Skip header row
            if ((tasksRows[i][nameIndex] === taskName && tasksRows[i][typeIndex] === 'main') || // メインタスク自身
                (tasksRows[i][parentTaskIndex] === taskName && tasksRows[i][typeIndex] === 'sub')) { // メインタスクのサブタスク
                tasksToMove.push(tasksRows[i]);
                rowsToDelete.push(i + 1); // スプレッドシートの行番号は1始まり
            }
        }

        if (tasksToMove.length === 0) {
            console.warn(`Task \'${taskName}\' or its subtasks not found for moving.`);
            return false;
        }

        // Done_tasksシートに移動
        const doneTasksRange = 'Done_tasks!A:H';
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.sheetId,
            range: doneTasksRange,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: tasksToMove,
            },
        });
        console.log(`Task \'${taskName}\' and its subtasks moved to Done_tasks sheet.`);

        // Tasksシートから削除
        rowsToDelete.sort((a, b) => b - a); // 降順にソートして、行を削除してもインデックスが狂わないようにする
        for (const rowIndex of rowsToDelete) {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.sheetId,
                resource: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: 0, // TasksシートのIDを想定 (最初のシート)
                                dimension: 'ROWS',
                                startIndex: rowIndex - 1, // APIは0始まり
                                endIndex: rowIndex,
                            },
                        },
                    }],
                },
            });
        }
        console.log(`Task \'${taskName}\' and its subtasks deleted from Tasks sheet.`);
        return true;
    }

    async deleteTask(taskName) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.warn('No tasks found in the spreadsheet for deletion.');
            return false;
        }

        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const typeIndex = header.indexOf('type');
        const parentTaskIndex = header.indexOf('parentTask');

        if (nameIndex === -1 || typeIndex === -1 || parentTaskIndex === -1) {
            console.error('Required columns not found in spreadsheet header for deletion.');
            return false;
        }

        let rowsToDelete = [];
        for (let i = 1; i < rows.length; i++) { // Skip header row
            if ((rows[i][nameIndex] === taskName && rows[i][typeIndex] === 'main') || // メインタスク自身
                (rows[i][parentTaskIndex] === taskName && rows[i][typeIndex] === 'sub')) { // メインタスクのサブタスク
                rowsToDelete.push(i + 1); // スプレッドシートの行番号は1始まり
            }
        }

        if (rowsToDelete.length === 0) {
            console.warn(`Task \'${taskName}\' or its subtasks not found for deletion.`);
            return false;
        }

        // 行番号を降順にソートして、行を削除してもインデックスが狂わないようにする
        rowsToDelete.sort((a, b) => b - a);

        for (const rowIndex of rowsToDelete) {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.sheetId,
                resource: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: 0, // 最初のシート (Tasksシート) のIDを想定。動的に取得することも可能だが、今回は固定
                                dimension: 'ROWS',
                                startIndex: rowIndex - 1, // APIは0始まり
                                endIndex: rowIndex, // endIndexは含まれないため +1
                            },
                        },
                    }],
                },
            });
            console.log(`Deleted row ${rowIndex} (task: ${taskName} or its subtask).`);
        }
        return true;
    }

    async updateMainTaskProgress(mainTaskName) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return false;
        }

        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const progressIndex = header.indexOf('progress');
        const typeIndex = header.indexOf('type');
        const parentTaskIndex = header.indexOf('parentTask');

        if (nameIndex === -1 || progressIndex === -1 || typeIndex === -1 || parentTaskIndex === -1) {
            console.error('Required columns (name, progress, type, or parentTask) not found in spreadsheet header for main task progress update.');
            return false;
        }

        let mainTaskRowIndex = -1;
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][nameIndex] === mainTaskName && rows[i][typeIndex] === 'main') {
                mainTaskRowIndex = i;
                break;
            }
        }

        if (mainTaskRowIndex === -1) {
            console.warn(`Main task \'${mainTaskName}\' not found.`);
            return false;
        }

        const subtasks = rows.slice(1).filter(row => row[parentTaskIndex] === mainTaskName && row[typeIndex] === 'sub');

        let totalProgress = 0;
        if (subtasks.length > 0) {
            const sumOfProgress = subtasks.reduce((sum, subtask) => {
                const subtaskProgress = parseInt(subtask[progressIndex], 10);
                return isNaN(subtaskProgress) ? sum : sum + subtaskProgress;
            }, 0);
            totalProgress = Math.round(sumOfProgress / subtasks.length);
        } else {
            // サブタスクがない場合、メインタスク自身の進捗は0とします
            totalProgress = 0;
        }

        const currentMainTaskProgress = parseInt(rows[mainTaskRowIndex][progressIndex], 10);
        if (isNaN(currentMainTaskProgress) || currentMainTaskProgress !== totalProgress) {
            const updateRange = `Tasks!${String.fromCharCode(65 + progressIndex)}${mainTaskRowIndex + 1}`;
            const values = [[totalProgress]];

            const resource = {
                values,
            };

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.sheetId,
                range: updateRange,
                valueInputOption: 'USER_ENTERED',
                resource,
            });
            console.log(`Main task \'${mainTaskName}\' progress updated to ${totalProgress}%.`);
        } else {
            console.log(`Main task \'${mainTaskName}\' progress is already ${totalProgress}%. No update needed.`);
        }

        // メインタスクの進捗が100%になったら削除/転送
        if (totalProgress === 100) {
            console.log(`Main task \'${mainTaskName}\' reached 100% progress. Moving task to Done_tasks sheet.`);
            await this.moveTaskToDoneSheet(mainTaskName); // ここで移動を呼び出す
        }

        return true;
    }

    async getTasksByGenre(genre) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H'; // parentTask列を追加したのでHまで
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }
        // ヘッダー行をスキップ
        const header = rows[0];
        const genreIndex = header.indexOf('genre'); // 仮にgenre列があるとする
        const typeIndex = header.indexOf('type');

        if (genreIndex === -1 || typeIndex === -1) {
            console.error('Required columns (genre or type) not found in spreadsheet header for getTasksByGenre.');
            return [];
        }

        return rows.slice(1)
            .filter(row => row[genreIndex] === genre && row[typeIndex] === 'main') // メインタスクのみフィルタリング
            .map(row => ({
                name: row[header.indexOf('name')],
                genre: row[genreIndex],
                deadline: row[header.indexOf('deadline')],
                progress: parseInt(row[header.indexOf('progress')], 10)
            }));
    }

    async getTaskDetails(taskName) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H'; // parentTask列を追加したのでHまで
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return null;
        }
        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const typeIndex = header.indexOf('type');
        const parentTaskIndex = header.indexOf('parentTask');

        const taskRow = rows.slice(1).find(row => row[nameIndex] === taskName && row[typeIndex] === 'main');
        if (!taskRow) {
            return null;
        }

        const subtasks = rows.slice(1)
            .filter(row => row[parentTaskIndex] === taskName && row[typeIndex] === 'sub')
            .map(row => ({
                name: row[nameIndex],
                progress: parseInt(row[header.indexOf('progress')], 10),
                deadline: row[header.indexOf('deadline')] || '未設定', // サブタスクの締め切りも表示
            }));

        return {
            name: taskRow[nameIndex],
            genre: taskRow[header.indexOf('genre')],
            progress: parseInt(taskRow[header.indexOf('progress')], 10),
            deadline: taskRow[header.indexOf('deadline')],
            userId: taskRow[header.indexOf('userId')],
            subtasks: subtasks,
        };
    }
    async calculateMainTaskProgress(mainTaskName, updatedSubtaskName, newSubtaskProgress) {
        if (!this.sheets) await this.authorize();
        const range = 'Tasks!A:H';
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return { oldMainProgress: 0, newMainProgress: 0 };
        }

        const header = rows[0];
        const nameIndex = header.indexOf('name');
        const progressIndex = header.indexOf('progress');
        const parentTaskIndex = header.indexOf('parentTask');

        const mainTaskRow = rows.find(row => row[nameIndex] === mainTaskName);
        if (!mainTaskRow) return { oldMainProgress: 0, newMainProgress: 0 };

        const oldMainProgress = parseInt(mainTaskRow[progressIndex], 10) || 0;

        const subtasks = rows.slice(1).filter(row => row[parentTaskIndex] === mainTaskName);

        if (subtasks.length === 0) {
            return { oldMainProgress, newMainProgress: oldMainProgress };
        }

        let totalProgress = 0;
        subtasks.forEach(row => {
            if (row[nameIndex] === updatedSubtaskName) {
                totalProgress += newSubtaskProgress;
            } else {
                totalProgress += parseInt(row[progressIndex], 10) || 0;
            }
        });

        const newMainProgress = Math.floor(totalProgress / subtasks.length);
        
        return { oldMainProgress, newMainProgress };
    }
}
