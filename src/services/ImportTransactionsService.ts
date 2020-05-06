import csvParse from 'csv-parse';
import fs from 'fs';
import { getCustomRepository, getRepository, In } from 'typeorm';

import TransactionsRepository from '../repositories/TransactionsRepository';

import Category from '../models/Category';
import Transaction from '../models/Transaction';

interface TransactionCSV {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(path: string): Promise<Transaction[]> {
    const categoriesRepository = getRepository(Category);
    const transactionsRepository = getCustomRepository(TransactionsRepository);

    const fileStream = fs.createReadStream(path);

    const parser = csvParse({
      from_line: 2,
    });
    const parseCSV = fileStream.pipe(parser);

    const transactions: TransactionCSV[] = [];
    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value || !category) return;

      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const categories = transactions
      .map(({ category }) => category)
      .filter((category, index, self) => self.indexOf(category) === index);

    const existentCategories = await categoriesRepository.find({
      where: { title: In(categories) },
    });
    const existentCategoriesTitle = existentCategories.map(
      ({ title }) => title,
    );
    const newCategoriesTitle = categories
      .filter(category => !existentCategoriesTitle.includes(category))
      .map(category => ({ title: category }));
    const newCategories = categoriesRepository.create(newCategoriesTitle);
    await categoriesRepository.save(newCategories);

    const allCategories = [...existentCategories, ...newCategories];
    const createTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: allCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createTransactions);

    await fs.promises.unlink(path);

    return createTransactions;
  }
}

export default ImportTransactionsService;
