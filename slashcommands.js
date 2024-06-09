const { SlashCommandBuilder } = require("@discordjs/builders");

const commands = [
  //Play Command
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Plays a song from YouTube")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("The YouTube URL or search query to play")
        .setRequired(true),
    ),
];

module.exports = commands.map((command) => command.toJSON());
