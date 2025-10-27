import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();



const commands = [
    {
        name: 'task',
        description: 'タスク管理コマンド',
        options: [
            {
                name: 'create',
                description: '新しいタスクを作成します。',
                type: 1, // Subcommand type (サブコマンドタイプ)
                options: [
                    {
                        name: 'name',
                        description: 'タスク名',
                        type: 3, // String type (文字列タイプ)
                        required: true,
                        autocomplete: true,
                    },
                    {
                        name: 'genre',
                        description: 'タスクのジャンル (例: 仕事, 学校)',
                        type: 3,
                        required: true,
                        autocomplete: true,
                    },
                    {
                        name: 'deadline',
                        description: '締め切り日 (例: 2023-12-31)',
                        type: 3,
                        required: false,
                    },
                    {
                        name: 'recurrent',
                        description: '繰り返し設定 (例: weekly)',
                        type: 3,
                        required: false,
                        choices: [
                            { name: '毎週', value: 'weekly' },
                            { name: '毎月', value: 'monthly' },
                        ],
                    },
                    // ... サブタスクなどのオプションは後で追加します
                ],
            },
            {
                name: 'update_progress',
                description: 'タスクの進捗率を更新します。',
                type: 1, // Subcommand type (サブコマンドタイプ)
                options: [
                    {
                        name: 'task_name',
                        description: '更新するタスク名',
                        type: 3, // String type (文字列タイプ)
                        required: true,
                        autocomplete: true,
                    },
                    {
                        name: 'progress',
                        description: '新しい進捗率 (0-100)',
                        type: 4, // Integer type (整数タイプ)
                        required: true,
                    },
                ],
            },
            {
                name: 'add_subtask',
                description: '既存のタスクにサブタスクを追加します。',
                type: 1, // Subcommand type
                options: [
                    {
                        name: 'parent_task_name',
                        description: 'サブタスクを追加するメインタスク名',
                        type: 3,
                        required: true,
                        autocomplete: true,
                    },
                    {
                        name: 'subtask_name',
                        description: 'サブタスク名',
                        type: 3,
                        required: true,
                        autocomplete: true,
                    },
                    {
                        name: 'deadline',
                        description: 'サブタスクの締め切り日 (例: 2023-12-31)',
                        type: 3,
                        required: false,
                    },
                ],
            },
            {
                name: 'update_subtask_progress',
                description: 'サブタスクの進捗率を更新します。',
                type: 1, // Subcommand type
                options: [
                    {
                        name: 'subtask_name',
                        description: '更新するサブタスク名',
                        type: 3,
                        required: true,
                        autocomplete: true,
                    },
                    {
                        name: 'progress',
                        description: '新しい進捗率 (0-100)',
                        type: 4,
                        required: true,
                    },
                ],
            },
            {
                name: 'list_by_genre',
                description: '指定されたジャンルのタスク一覧を表示します。',
                type: 1, // Subcommand type (サブコマンドタイプ)
                options: [
                    {
                        name: 'genre',
                        description: '表示したいタスクのジャンル',
                        type: 3,
                        required: true,
                        autocomplete: true,
                    },
                ],
            },
            {
                name: 'show_details',
                description: '指定されたタスクの詳細を表示します。',
                type: 1, // Subcommand type (サブコマンドタイプ)
                options: [
                    {
                        name: 'task_name',
                        description: '詳細を表示したいタスク名',
                        type: 3,
                        required: true,
                        autocomplete: true,
                    },
                ],
            },
        ],
    },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('アプリケーション (/) コマンドのリフレッシュを開始しました。');

        if (!process.env.DISCORD_TOKEN) {
            console.error('❌ DISCORD_TOKEN が設定されていません！');
            process.exit(1);
        }
        if (!process.env.CLIENT_ID) {
            console.error('❌ CLIENT_ID が設定されていません！');
            process.exit(1);
        }
        if (!process.env.GUILD_ID) {
            console.error('❌ GUILD_ID が設定されていません！');
            process.exit(1);
        }
        console.log(`✅ 環境変数を読み込みました: CLIENT_ID=${process.env.CLIENT_ID}, GUILD_ID=${process.env.GUILD_ID}`);

        // 特定のギルド（サーバー）にのみ登録する場合（開発・テスト用）
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('アプリケーション (/) コマンドのリロードに成功しました。');
    } catch (error) {
        console.error('コマンドのリロード中にエラーが発生しました:', error);
    }
})();
