import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

const BCRYPT_ROUNDS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    notificationSettings: {
      enabled: { type: Boolean, default: true },
      tasks: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true },
      goals: { type: Boolean, default: true },
      schedule: { type: Boolean, default: true },
      documents: { type: Boolean, default: true },
      aiSuggestions: { type: Boolean, default: false },
      timezone: { type: String, default: 'UTC' },
      version: { type: Number, default: 0 },
    },
    notificationJob: {
      nextCheckAt: { type: Date, default: () => new Date(0) },
      leaseUntil: { type: Date, default: null },
      leaseToken: { type: String, default: null },
    },
    briefingSettings: {
      enabled: { type: Boolean, default: true },
      hidden: { type: Boolean, default: false },
      version: { type: Number, default: 0 },
    },
    memorySettings: {
      enabled: { type: Boolean, default: true },
      autoSavePreferences: { type: Boolean, default: false },
      generation: { type: Number, default: 0 },
      consentVersion: { type: Number, default: 0 },
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [100, 'Full name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
      maxlength: [254, 'Email cannot exceed 254 characters'],
      match: [EMAIL_PATTERN, 'Enter a valid email address'],
    },
    password: {
      type: String,
      required: function passwordRequiredForLocalUser() {
        return !this.googleId;
      },
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    googleId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      select: false,
    },
    avatarUrl: {
      type: String,
      trim: true,
      maxlength: [2048, 'Avatar URL is too long'],
    },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashModifiedPassword() {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ 'notificationSettings.enabled': 1, 'notificationJob.nextCheckAt': 1, 'notificationJob.leaseUntil': 1 });
const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
