const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');
const config = require('./config.json');
const moment = require('moment-timezone');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const commands = [
  {
    name: 'setup-ticket',
    description: 'Sets up the ticket system embed message',
    options: [
      {
        name: 'channel',
        description: 'The channel to send the embed message to',
        type: 7,
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
        `\`\`\`Once you open a ticket, you'll have to answer the questions. Please fill them out so we can help you quickly and understand your issue better!\`\`\``
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

    if (!category || category.type !== ChannelType.GuildCategory) {
      return interaction.reply({
        content: 'Invalid category ID in the config file.',
        ephemeral: true,
      });
    }

    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
      ],
    });

    const timeInIST = moment().tz("Asia/Kolkata").format('YYYY-MM-DD HH:mm:ss');

    // Find members with the specified role ID
const adminRole = interaction.guild.roles.cache.get(config.adminRoleId);

if (adminRole) {
  const adminMembers = adminRole.members;

  const adminEmbed = new EmbedBuilder()
    .setTitle('Ticket Created')
    .setDescription(
      `**Ticket Opened by** - <@${interaction.user.id}>\n` +
      `**Ticket Opened Time** - ${timeInIST}\n` +
      `**Ticket Category** - ${category.name}\n` +
      `**Ticket Channel** - <#${ticketChannel.id}>`
    )
    .setColor('Green');

  // Send DM to each member with the specified role
  adminMembers.forEach(async (member) => {
    try {
      await member.send({ embeds: [adminEmbed] });
    } catch (err) {
      console.error(`Couldn't send DM to ${member.user.tag}: ${err.message}`);
    }
  });
} else {
  console.error('Admin role not found!');
}


    const welcomeEmbed = new EmbedBuilder()
      .setDescription(`Hey there <@${interaction.user.id}>! Thanks for opening a ticket!\nAn available staff member will assist you shortly. Please be patient!`)
      .setColor('Green');

    await ticketChannel.send({ embeds: [welcomeEmbed] });

    const closeButton = new ButtonBuilder()
      .setCustomId('close-ticket')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(closeButton);
    await ticketChannel.send({ components: [row] });

    await interaction.reply({ content: 'Ticket created successfully!', ephemeral: true });
  }
});

// Handle button interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'close-ticket') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'You do not have permission to close this ticket!', ephemeral: true });
    }

    const ticketChannel = interaction.channel;

    await interaction.reply({ content: 'Ticket will be closed shortly...', ephemeral: true });

    if (ticketChannel && ticketChannel.type === ChannelType.GuildText) {
      setTimeout(async () => {
        await ticketChannel.delete();
      }, 3000);
    }
  }
});

// Log in the bot
client.login(config.token);
