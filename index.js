// index.js
require("./keepalive");

const {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection,
} = require("@discordjs/voice");
const sodium = require("libsodium-wrappers");
const commands = require("./slashcommands");
const ytdl = require("ytdl-core");
const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const TOKEN = process.env.TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CLIENT_ID = "1244549924994154506";
const GUILD_ID = "1242355901113958480";

client.commands = new Collection();

const rest = new REST({ version: "9" }).setToken(TOKEN);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();

const IDLE_TIMEOUT = 600000;
let player;
let resource;
let currentConnection;
let currentMessage; // Store the message to be edited later
let userStop = false; // Flag to track if the stop was initiated by the user
let timeoutId; // Variable to store the timeout ID

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.buttons = (state) => {
  return new ActionRowBuilder().addComponents([
    new ButtonBuilder()
      .setStyle(ButtonStyle.Success)
      .setCustomId("play")
      .setLabel("Play")
      .setDisabled(state),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Primary)
      .setCustomId("pause")
      .setLabel("Pause")
      .setDisabled(state),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Danger)
      .setCustomId("stop")
      .setLabel("Stop")
      .setDisabled(state),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setCustomId("quit")
      .setLabel("Quit"),
  ]);
};

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand() && !interaction.isButton()) return;

  if (interaction.isCommand()) {
    const { commandName } = interaction;

    if (commandName === "play") {
      const query = interaction.options.getString("query");

      let url = query;

      if (!ytdl.validateURL(query)) {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
          query,
        )}&key=${YOUTUBE_API_KEY}&maxResults=1`;

        try {
          const response = await axios.get(searchUrl);
          const video = response.data.items[0];
          url = `https://www.youtube.com/watch?v=${video.id.videoId}`;
        } catch (error) {
          console.error("Error searching for video:", error);
          await interaction.reply(
            "There was an error searching for the video.",
          );
          return;
        }
      }

      if (ytdl.validateURL(url)) {
        const voiceChannel = interaction.member.voice.channel;

        if (voiceChannel) {
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
          });

          currentConnection = connection;
          player = createAudioPlayer();
          resource = createAudioResource(ytdl(url, { filter: "audioonly" }));

          // Clear any existing timeout when a new song starts playing
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          player.on(AudioPlayerStatus.Idle, () => {
            if (!userStop) {
              const embed = new EmbedBuilder(currentMessage.embeds[0].toJSON());
              embed.setFooter({
                text: "ENDED",
                iconURL: "https://i.postimg.cc/sXLQwvF4/ended.png",
              });

              // Update the embed immediately
              currentMessage.edit({ embeds: [embed], components: [] });

              // Schedule the destruction of the connection after the specified timeout
              timeoutId = setTimeout(() => {
                if (currentConnection) {
                  currentConnection.destroy();
                  currentConnection = null; // Clear the connection
                }
              }, IDLE_TIMEOUT);
            }
            userStop = false; // Reset the flag after handling
          });

          try {
            const info = await ytdl.getInfo(url);

            const songTitle = info.videoDetails.title;
            const thumbnailUrl = info.videoDetails.thumbnails[0].url;
            const author = info.videoDetails.author.name;
            const duration = new Date(info.videoDetails.lengthSeconds * 1000)
              .toISOString()
              .substr(11, 8);
            const views = info.videoDetails.viewCount;

            const embed = new EmbedBuilder()
              .setTitle(songTitle)
              //.setURL(url)
              .setThumbnail(thumbnailUrl)
              .setColor("#32a464")
              .addFields(
                { name: "Author", value: author, inline: true },
                { name: "Duration", value: duration, inline: true },
                { name: "Views", value: views.toLocaleString(), inline: true },
              )
              .setFooter({
                text: "PLAYING",
                iconURL: "https://i.postimg.cc/zvRLM88Z/playing.png",
              });

            const message = await interaction.reply({
              embeds: [embed],
              components: [client.buttons(false)],
              fetchReply: true,
            });

            currentMessage = message; // Save the message to edit later

            player.play(resource);
            connection.subscribe(player);
          } catch (error) {
            console.error("Error creating audio resource:", error);
            await interaction.reply(
              "There was an error creating the audio resource.",
            );
            return;
          }
        } else {
          await interaction.reply(
            "You need to be in a voice channel to play music.",
          );
        }
      } else {
        await interaction.reply("Please provide a valid YouTube URL.");
      }
    }
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId === "play") {
      if (player) {
        if (player.state.status === AudioPlayerStatus.Paused) {
          player.unpause();
          const embed = new EmbedBuilder(currentMessage.embeds[0].toJSON());
          embed.setFooter({
            text: "PLAYING",
            iconURL: "https://i.postimg.cc/zvRLM88Z/playing.png",
          });
          await currentMessage.edit({ embeds: [embed] });
        }
        await interaction.deferUpdate();
      }
    } else if (customId === "pause") {
      if (player) {
        if (player.state.status === AudioPlayerStatus.Playing) {
          player.pause();
          const embed = new EmbedBuilder(currentMessage.embeds[0].toJSON());
          embed.setFooter({
            text: "PAUSED",
            iconURL: "https://i.postimg.cc/9fJqwLJS/paused.png",
          });
          await currentMessage.edit({ embeds: [embed] });
        }
        await interaction.deferUpdate();
      }
    } else if (customId === "stop") {
      if (currentConnection) {
        userStop = true; // Set the flag to true when the user presses stop

        // Clear any existing timeout when stop button is pressed
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        player.stop();
        // Update the embed immediately
        const embed = new EmbedBuilder(currentMessage.embeds[0].toJSON());
        embed.setFooter({
          text: "STOPPED",
          iconURL: "https://i.postimg.cc/vBTxr5Km/stopped.png",
        });
        await currentMessage.edit({ embeds: [embed], components: [] });

        // Schedule the destruction of the connection after the specified timeout
        timeoutId = setTimeout(() => {
          if (currentConnection) {
            currentConnection.destroy();
            currentConnection = null; // Clear the connection
          }
        }, IDLE_TIMEOUT);

        await interaction.deferUpdate();
      }
    } else if (customId === "quit") {
      if (currentConnection) {
        userStop = true; // Set the flag to true when the user presses quit

        // Clear any existing timeout when quit button is pressed
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        player.stop();
        // Update the embed immediately
        const embed = new EmbedBuilder(currentMessage.embeds[0].toJSON());
        embed.setFooter({
          text: "DISCONNECTED",
          iconURL: "https://i.postimg.cc/02N4mPfG/quit.png",
        });
        await currentMessage.edit({ embeds: [embed], components: [] });

        if (currentConnection) {
          currentConnection.destroy();
          currentConnection = null; // Clear the connection
        }

        await interaction.deferUpdate();
      }
    }
  }
});

(async () => {
  await sodium.ready;
  console.log("libsodium-wrappers is ready");
})();

client.login(TOKEN);
