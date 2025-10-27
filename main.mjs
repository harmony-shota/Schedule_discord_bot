// main.mjs - Discord Botのメインプログラム

// 必要なライブラリを読み込み
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import { GoogleSheetManager } from './models/GoogleSheetManager.mjs';
import { Scheduler } from './handlers/scheduler.mjs';
import { GeminiHandler } from './handlers/gemini.mjs';
import { prompts } from './prompts.mjs';

// .envファイルから環境変数を読み込み
dotenv.config();

// Discord Botクライアントを作成
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

const googleSheetManager = new GoogleSheetManager(process.env.SPREADSHEET_ID);
const geminiHandler = new GeminiHandler();
const scheduler = new Scheduler(client, googleSheetManager, geminiHandler);

// Helper function to get a random character
const getRandomCharacter = () => {
    const characters = [
        { name: 'シャルルマーニュ', prompt: prompts.Charlemagne(), image: 'https://pbs.twimg.com/media/G0o9u8laUAAdyk8?format=jpg' },
        { name: '藤堂平助', prompt: prompts.Heisuke_Toudou(), image: 'https://pbs.twimg.com/media/G4GrJSIWoAAjeeK?format=jpg' }
    ];
    const pick = Math.floor(Math.random() * characters.length);
    return characters[pick];
};

// Botが起動完了したときの処理
client.once('ready', async () => {
    console.log(`🎉 ${client.user.tag} が正常に起動しました！`);
    console.log(`📊 ${client.guilds.cache.size} つのサーバーに参加中`);

    try {
        await googleSheetManager.authorize();
        console.log('✅ Google Sheets API 認証成功');
        await googleSheetManager.setConditionalFormatting();
        scheduler.startScheduling();
    } catch (error) {
        console.error('❌ Google Sheets API 認証失敗:', error);
        process.exit(1);
    }
});

// Express Webサーバーの設定
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.json({ status: 'Bot is running! 🤖' }));
app.listen(port, () => console.log(`🌐 Web サーバーがポート ${port} で起動しました`));

// スラッシュコマンドとオートコンプリートの処理を一つのリスナーに統合
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName !== 'task') return;

        const subcommand = interaction.options.getSubcommand();
        try {
            await interaction.deferReply();

            if (subcommand === 'create') {
                const taskName = interaction.options.getString('name');
                const genre = interaction.options.getString('genre');
                const deadline = interaction.options.getString('deadline');
                const userId = interaction.user.id;

                const { name: characterName, prompt: characterPrompt, image: characterImage } = getRandomCharacter();
                const prompt = prompts.taskCreate(taskName, genre, deadline, characterPrompt);
                const characterLine = await geminiHandler.generateCharacterLine(prompt);

                await googleSheetManager.createTask(taskName, genre, deadline, userId);
                await googleSheetManager.sortTasksByDeadline();

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(taskName)
                    .setAuthor({ name: characterName })
                    .setDescription(characterLine || null)
                    .setImage(characterImage)
                    .addFields(
                        { name: 'ジャンル', value: genre, inline: true },
                        { name: '締め切り', value: deadline || '未設定', inline: true },
                        { name: '作成者', value: `<@${userId}>`, inline: true },
                    )
                    .setTimestamp()
                    .setFooter({ text: '新しいタスクが作成されました！' });

                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'update_progress') {
                const taskName = interaction.options.getString('task_name');
                const progress = interaction.options.getInteger('progress');

                const oldTask = await googleSheetManager.getTaskByName(taskName, 'main');
                if (!oldTask) {
                    return interaction.editReply({ content: `タスク「${taskName}」が見つかりません。`, ephemeral: true });
                }

                const { name: characterName, prompt: characterPrompt, image: characterImage } = getRandomCharacter();
                const prompt = prompts.taskUpdateProgress(taskName, oldTask.progress, progress, characterPrompt);
                const characterLine = await geminiHandler.generateCharacterLine(prompt);

                await googleSheetManager.updateTaskProgress(taskName, progress);
                await googleSheetManager.sortTasksByDeadline();

                const embed = new EmbedBuilder()
                    .setColor('#65BBE9')
                    .setTitle(`${taskName} の進捗を更新しました！`)
                    .setAuthor({ name: characterName })
                    .setDescription(characterLine || null)
                    .setImage(characterImage)
                    .addFields(
                        { name: '以前の進捗', value: `${oldTask.progress}%`, inline: true },
                        { name: '新しい進捗', value: `${progress}%`, inline: true },
                        { name: '締め切り', value: oldTask.deadline, inline: false },
                    )
                    .setTimestamp()
                    .setFooter({ text: '進捗更新' });

                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'add_subtask') {
                const parentTaskName = interaction.options.getString('parent_task_name');
                const subtaskNameRaw = interaction.options.getString('subtask_name');
                const deadline = interaction.options.getString('deadline');
                const userId = interaction.user.id;
                const subtaskName = `${parentTaskName}-${subtaskNameRaw}`;

                const { name: characterName, prompt: characterPrompt, image: characterImage } = getRandomCharacter();
                const prompt = prompts.subtaskCreate(subtaskName, parentTaskName, characterPrompt);
                const characterLine = await geminiHandler.generateCharacterLine(prompt);

                await googleSheetManager.addSubtask(parentTaskName, subtaskName, deadline, userId);
                await googleSheetManager.sortTasksByDeadline();

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(subtaskName)
                    .setAuthor({ name: characterName })
                    .setDescription(characterLine || null)
                    .setImage(characterImage)
                    .addFields(
                        { name: 'メインタスク', value: parentTaskName, inline: true },
                        { name: '締め切り', value: deadline || '未設定', inline: true },
                        { name: '作成者', value: `<@${userId}>`, inline: true },
                    )
                    .setTimestamp()
                    .setFooter({ text: '新しいサブタスクが作成されました！' });

                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'update_subtask_progress') {
                const subtaskName = interaction.options.getString('subtask_name');
                const progress = interaction.options.getInteger('progress');

                const oldSubtask = await googleSheetManager.getTaskByName(subtaskName, 'sub');
                if (!oldSubtask) {
                    return interaction.editReply({ content: `サブタスク「${subtaskName}」が見つかりません。`, ephemeral: true });
                }

                const { oldMainProgress, newMainProgress } = await googleSheetManager.calculateMainTaskProgress(oldSubtask.parentTask, subtaskName, progress);
                const oldSubtaskProgress = oldSubtask.progress ?? 0;

                const { name: characterName, prompt: characterPrompt, image: characterImage } = getRandomCharacter();
                const prompt = prompts.subtaskUpdateProgress(
                    subtaskName, oldSubtask.parentTask, progress, characterPrompt,
                    oldMainProgress, newMainProgress, oldSubtaskProgress
                );
                const characterLine = await geminiHandler.generateCharacterLine(prompt);
                
                await googleSheetManager.updateSubtaskProgress(subtaskName, progress);
                await googleSheetManager.sortTasksByDeadline();

                const mainTaskAfter = await googleSheetManager.getTaskByName(oldSubtask.parentTask, 'main');

                const embed = new EmbedBuilder()
                    .setColor('#65BBE9')
                    .setTitle(`${subtaskName} の進捗を更新しました！`)
                    .setAuthor({ name: characterName })
                    .setDescription(characterLine || null)
                    .setImage(characterImage)
                    .addFields(
                        { name: '以前の進捗', value: `${oldSubtaskProgress}%`, inline: true },
                        { name: '新しい進捗', value: `${progress}%`, inline: true },
                        { name: '締め切り', value: oldSubtask.deadline, inline: false },
                        { name: '親タスク', value: `${mainTaskAfter.name} (${mainTaskAfter.progress}%)`, inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'サブタスク進捗更新' });

                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'list_by_genre') {
                const genre = interaction.options.getString('genre');
                const tasks = await googleSheetManager.getTasksByGenre(genre);
                
                let descriptionContent = '';
                if (tasks.length > 0) {
                    for (const task of tasks) {
                        const hasSubtasks = await googleSheetManager.hasSubtasks(task.name);
                        descriptionContent += `- ${task.name} ${hasSubtasks ? ':signal_strength:' : ''} (進捗: ${task.progress}%, 締め切り: ${task.deadline || '未設定'})\n`;
                    }
                } else {
                    descriptionContent += '該当するタスクはありません。';
                }

                const embed = new EmbedBuilder()
                    .setColor('#ADD8E6')
                    .setTitle(`${genre} ジャンルのタスク一覧`)
                    .setDescription(descriptionContent)
                    .setTimestamp()
                    .setFooter({ text: 'タスク一覧' });

                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'show_details') {
                const taskName = interaction.options.getString('task_name');
                const taskDetails = await googleSheetManager.getTaskDetails(taskName);
                
                if (!taskDetails) {
                    return interaction.editReply({ content: `タスク「${taskName}」は見つかりませんでした。` });
                }

                let descriptionContent = '';
                if (taskDetails.subtasks && taskDetails.subtasks.length > 0) {
                    descriptionContent += '**サブタスク**\n';
                    taskDetails.subtasks.forEach(subtask => {
                        descriptionContent += `- ${subtask.name} (進捗: ${subtask.progress}%, 締め切り: ${subtask.deadline || '未設定'})\n`;
                    });
                } else {
                    descriptionContent += 'サブタスクはありません。\n';
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFFFFF')
                    .setTitle(taskDetails.name)
                    .addFields(
                        { name: 'ジャンル', value: taskDetails.genre, inline: true },
                        { name: '締め切り', value: taskDetails.deadline || '未設定', inline: true },
                        { name: '全体の進捗', value: `${taskDetails.progress}%`, inline: true },
                        { name: '作成者', value: `<@${taskDetails.userId}>`, inline: true },
                    )
                    .setDescription(descriptionContent)
                    .setTimestamp()
                    .setFooter({ text: 'タスク詳細' });

                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('スラッシュコマンド処理中にエラーが発生しました:', error);
            const replyOptions = { content: 'コマンドの処理中にエラーが発生しました。', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyOptions);
            } else {
                await interaction.reply(replyOptions);
            }
        }
    } else if (interaction.isAutocomplete()) {
        try {
            const focusedOption = interaction.options.getFocused(true);
            let choices = [];

            if (focusedOption.name === 'genre') {
                const genres = await googleSheetManager.getAllGenres();
                choices = genres.map(genre => ({ name: genre, value: genre }));
            } else if (focusedOption.name === 'task_name' || focusedOption.name === 'parent_task_name') {
                const mainTaskNames = await googleSheetManager.getAllMainTaskNames();
                choices = mainTaskNames.map(name => ({ name: name, value: name }));
            } else if (focusedOption.name === 'subtask_name' && interaction.options.getSubcommand() === 'update_subtask_progress') {
                const subtaskNames = await googleSheetManager.getAllSubtaskNames();
                choices = subtaskNames.map(name => ({ name: name, value: name }));
            }

            const filtered = choices.filter(choice => choice.name.startsWith(focusedOption.value));
            await interaction.respond(filtered.slice(0, 25));

        } catch (error) {
            console.error(`Autocomplete error: ${error.message}`);
            // タイムアウトエラーの場合、Botがクラッシュしないようにエラーを記録するだけにする
        }
    }
});

// Discord にログイン
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN が .env ファイルに設定されていません！');
    process.exit(1);
}
console.log('🔄 Discord に接続中...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ ログインに失敗しました:', error);
    process.exit(1);
});

// プロセス終了時の処理
process.on('SIGINT', () => {
    console.log('🛑 Botを終了しています...');
    client.destroy();
    process.exit(0);
}); 
