import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';

const TEST_EMAIL = 'testuser@lifeadmin.local';

function check(condition, label) {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(29, '.')} PASS`);
}

async function run() {
  try {
    await connectDB();
    check(mongoose.connection.readyState === 1, 'MongoDB connection');

    await User.init();
    await User.deleteOne({ email: TEST_EMAIL });

    const user = await User.create({
      fullName: '  Test User  ',
      email: 'TESTUSER@LIFEADMIN.LOCAL',
      password: 'TestPassword123',
    });

    check(Boolean(user.id), 'User creation');
    check(user.fullName === 'Test User', 'Full name trimming');
    check(user.email === TEST_EMAIL, 'Email normalization');
    check(user.password !== 'TestPassword123' && user.password.startsWith('$2'), 'Password hashed');
    check(await user.comparePassword('TestPassword123'), 'Correct password');
    check(!(await user.comparePassword('WrongPassword')), 'Wrong password');

    const originalHash = user.password;
    user.fullName = 'Updated Test User';
    await user.save();
    check(user.password === originalHash && (await user.comparePassword('TestPassword123')), 'No double hashing');

    user.password = 'NewTestPassword456';
    await user.save();
    const oldPasswordRejected = !(await user.comparePassword('TestPassword123'));
    const newPasswordAccepted = await user.comparePassword('NewTestPassword456');
    check(user.password !== originalHash && oldPasswordRejected && newPasswordAccepted, 'Password change hashing');

    const normalQuery = await User.findById(user.id);
    check(normalQuery.password === undefined, 'Password query exclusion');

    let duplicateRejected = false;
    try {
      await User.create({
        fullName: 'Duplicate Test User',
        email: 'TESTUSER@LIFEADMIN.LOCAL',
        password: 'AnotherPassword123',
      });
    } catch (error) {
      duplicateRejected = error?.code === 11000;
    }
    check(duplicateRejected, 'Duplicate email rejected');

    console.log('User model verification completed successfully.');
  } catch (error) {
    console.error(`User model verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

run();
