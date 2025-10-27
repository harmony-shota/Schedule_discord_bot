import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';
import { prompts } from '../prompts.mjs';

export class Scheduler {
    constructor(client, googleSheetManager, geminiHandler) {
        this.client = client;
        this.googleSheetManager = googleSheetManager;
        this.geminiHandler = geminiHandler;
    }

    startScheduling() {
        // 毎週月曜日の午前9時に週次タスクを通知
        cron.schedule('0 9 * * 1', () => {
            this.sendWeeklyTaskMentions();
        }, {
            timezone: "Asia/Tokyo"
        });

        // 毎日午前9時に締め切り通知をチェック
        cron.schedule('0 9 * * *', () => {
            this.checkDeadlines();
        }, {
            timezone: "Asia/Tokyo"
        });

        // Announceジャンルのタスク通知（毎週日曜日の午前10時）
        cron.schedule('0 10 * * 0', () => {
            this.sendAnnounceTasks();
        }, {
            timezone: "Asia/Tokyo"
        });

        console.log('✅ Scheduling started.');
    }

    async sendWeeklyTaskMentions() {
        console.log('Sending weekly task mentions...');
        const tasks = await this.googleSheetManager.getRecurrentTasks('weekly');

        if (tasks.length === 0) {
            console.log('No weekly tasks found.');
            return;
        }

        const generalChannelId = process.env.GENERAL_CHANNEL_ID;
        if (!generalChannelId) {
            console.error('GENERAL_CHANNEL_ID is not set in .env.');
            return;
        }
        const channel = await this.client.channels.fetch(generalChannelId);
        if (!channel || !channel.isTextBased()) {
            console.error(`Channel with ID ${generalChannelId} not found or is not a text channel.`);
            return;
        }

        const prompt = prompts.weeklyNotification();
        const characterLine = await this.geminiHandler.generateCharacterLine(prompt);
        let descriptionContent = `${characterLine}\n\n今週の繰り返しタスクです！頑張りましょう！\n`;
        for (const task of tasks) {
            descriptionContent += `- **${task.name}** (<@${task.userId}>)\n`;
        }

        const embed = new EmbedBuilder()
            .setColor('#FFD700') // ゴールド系統
            .setTitle('週次タスク通知')
            .setDescription(descriptionContent)
            .setTimestamp()
            .setFooter({ text: '自動通知' });

        await channel.send({ content: `<@&${generalChannelId}>`, embeds: [embed] }); // 全員にメンション
        console.log('Weekly task mentions sent.');
    }

    async checkDeadlines() {
        console.log('Checking deadlines...');
        const tasks = await this.googleSheetManager.getAllTasksWithDeadlines();

        if (tasks.length === 0) {
            console.log('No tasks with deadlines found.');
            return;
        }

        const now = new Date();
        const notifications = {
            '1ヶ月前': [],
            '2週間前': [],
            '1週間前': [],
        };

        for (const task of tasks) {
            const deadline = new Date(task.deadline);
            const diffTime = deadline.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 30) { // 約1ヶ月前
                notifications['1ヶ月前'].push(task);
            } else if (diffDays === 14) { // 2週間前
                notifications['2週間前'].push(task);
            } else if (diffDays === 7) { // 1週間前
                notifications['1週間前'].push(task);
            }
        }

        const generalChannelId = process.env.GENERAL_CHANNEL_ID;
        if (!generalChannelId) {
            console.error('GENERAL_CHANNEL_ID is not set in .env.');
            return;
        }
        const channel = await this.client.channels.fetch(generalChannelId);
        if (!channel || !channel.isTextBased()) {
            console.error(`Channel with ID ${generalChannelId} not found or is not a text channel.`);
            return;
        }

        for (const key in notifications) {
            if (notifications[key].length > 0) {
                const prompt = prompts.deadlineNotification(key);
                const characterLine = await this.geminiHandler.generateCharacterLine(prompt);
                let descriptionContent = `${characterLine}\n\n${key}に締め切りのタスクがあります！\n`;
                for (const task of notifications[key]) {
                    descriptionContent += `- **${task.name}** (<@${task.userId}>) - 締め切り: ${task.deadline}\n`;
                }
                const embed = new EmbedBuilder()
                    .setColor('#FFA500') // オレンジ系統
                    .setTitle(`${key}締め切り通知`)
                    .setDescription(descriptionContent)
                    .setTimestamp()
                    .setFooter({ text: '自動通知' });

                await channel.send({ embeds: [embed] });
            }
        }
        console.log('Deadline checks completed.');
    }

    async sendAnnounceTasks() {
        console.log('Sending Announce tasks...');
        const announceChannelId = process.env.ANNOUNCE_CHANNEL_ID;
        if (!announceChannelId) {
            console.error('ANNOUNCE_CHANNEL_ID is not set in .env.');
            return;
        }
        const channel = await this.client.channels.fetch(announceChannelId);
        if (!channel || !channel.isTextBased()) {
            console.error(`Channel with ID ${announceChannelId} not found or is not a text channel.`);
            return;
        }

        // 締め切りが一ヶ月より前のAnnounceジャンルのタスクを取得
        const tasks = await this.googleSheetManager.getTasksByGenreForNotifications('Announce', true);

        if (tasks.length === 0) {
            console.log('No Announce tasks with deadlines beyond one month found.');
            return;
        }

        const prompt = prompts.announceNotification();
        const characterLine = await this.geminiHandler.generateCharacterLine(prompt);
        let descriptionContent = `${characterLine}\n\n今週の注目タスク！\n`;
        for (const task of tasks) {
            descriptionContent += `- **${task.name}** (締め切り: ${task.deadline})\n`;
        }

        const embed = new EmbedBuilder()
            .setColor('#800080') // 紫系統
            .setTitle('Announce タスク通知')
            .setDescription(descriptionContent)
            .setTimestamp()
            .setFooter({ text: '自動通知 (Announce)' });

        await channel.send({ embeds: [embed] });
        console.log('Announce tasks sent.');
    }
}
