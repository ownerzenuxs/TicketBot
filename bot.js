const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require('discord.js');
const config = require('./config.json');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const commands = [
  {
    name: 'setup-ticket',
    description: 'Sets up the ticket system embed message',
    options: [
      {
        name: 'channel',
        description: 'The channel to send the embed message to',
        type: 7, // Channel type
        required: true,
      },
    ],
  },
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error(error);
  }
})();

// Bot ready event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === 'setup-ticket') {
    const channel = options.getChannel('channel');
    if (!channel.isTextBased()) {
      return interaction.reply({
        content: 'Please select a text channel!',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(config.texts.embedTitle)
      .setDescription(
        `**Open a ticket!**\n\n` +
        `**How to create a ticket?**\n` +
        `Please choose the right category when opening a ticket. If you don't know what it falls under, please open a general support ticket.\n\n` +
        `\`\`\`Once you opened a ticket you'll have to answer the question. Please fill out them so we can help you quicker and understand your issue better!\`\`\``
      )
      .setColor('Blue');

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket-dropdown')
      .setPlaceholder(config.texts.dropdownPlaceholder)
      .addOptions(
        config.categories.map((cat) => ({
          label: cat.label,
          description: cat.description,
          value: cat.categoryId,
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Ticket system set up!', ephemeral: true });
  }
});

// Handle dropdown menu interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === 'ticket-dropdown') {
    const categoryId = interaction.values[0];
    const category = interaction.guild.channels.cache.get(categoryId);

    if (!category || category.type !== 4) { // 4 = Category type
      return interaction.reply({
        content: 'Invalid category ID in config file.',
        ephemeral: true,
      });
    }

    // Create a ticket channel
    const ticketChannel = await category.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: 0, // Text channel
      parent: categoryId,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: ['ViewChannel'],
        },
        {
          id: interaction.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
      ],
    });

    // Notify in the new ticket channel
    await ticketChannel.send({
      content: `@everyone, ${interaction.user} has created a ticket!`,
      embeds: [
        new EmbedBuilder()
          .setDescription(config.texts.ticketCreatedMessage)
          .setColor('Green'),
      ],
    });

    // Acknowledge interaction without locking dropdown
    await interaction.reply({
      content: 'Ticket created! You can open more tickets if needed.',
      ephemeral: true,
    });
  }
});

client.login(config.token);
